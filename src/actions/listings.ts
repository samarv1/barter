'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isOwnedObjectKey, validateListingInput } from '@/lib/validation'
import { deleteObjects } from '@/lib/s3'
import { emailListingSold, emailListingRelisted } from '@/lib/email'

export async function updateListing(
  id: string,
  fields: {
    title: string
    description: string | null
    price: number | null
    is_free: boolean
    category: string
    availability: string
    photo_keys: string[]
  }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: listing } = await supabase
    .from('listings')
    .select('seller_id, status')
    .eq('id', id)
    .single()

  if (!listing || listing.seller_id !== user.id) throw new Error('Unauthorized')
  if (listing.status !== 'active') throw new Error('Only active listings can be edited')

  const validationError = validateListingInput(fields, user.id)
  if (validationError) throw new Error(validationError)

  const { error } = await supabase
    .from('listings')
    .update({
      title: fields.title,
      description: fields.description,
      price: fields.is_free ? null : fields.price,
      is_free: fields.is_free,
      category: fields.category,
      availability: fields.availability,
      photo_keys: fields.photo_keys,
    })
    .eq('id', id)

  if (error) throw new Error(error.message)

  revalidatePath(`/listings/${id}`)
  revalidatePath('/')
  redirect(`/listings/${id}`)
}

export async function deleteListing(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: listing } = await supabase
    .from('listings')
    .select('seller_id, photo_keys')
    .eq('id', id)
    .single()

  if (!listing || listing.seller_id !== user.id) throw new Error('Unauthorized')

  if (listing.photo_keys?.length > 0) {
    await deleteObjects(listing.photo_keys.filter((key: unknown) => isOwnedObjectKey(key, user.id, 'listings')))
  }

  await supabase.from('listings').delete().eq('id', id)

  redirect('/')
}

export async function markAsSold(listingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: listing } = await supabase
    .from('listings')
    .select('id, seller_id, title, status')
    .eq('id', listingId)
    .single()

  if (!listing || listing.seller_id !== user.id) throw new Error('Unauthorized')
  if (listing.status !== 'active') throw new Error('Listing already closed')

  const service = createServiceClient()
  await service.from('listings').update({ status: 'claimed' }).eq('id', listingId)

  const { data: activeOffers } = await service
    .from('offers')
    .select('id, buyer_id, profiles(email)')
    .eq('listing_id', listingId)
    .in('status', ['pending', 'countered'])

  if (activeOffers && activeOffers.length > 0) {
    await service.from('offers').update({ status: 'declined' }).in('id', activeOffers.map(o => o.id))
    await service.from('offer_events').insert(
      activeOffers.map(o => ({ offer_id: o.id, actor_id: user.id, event_type: 'declined' as const, amount: null, message: null }))
    )
    const { error: notifError1 } = await service.from('notifications').insert(
      activeOffers.map(o => ({
        user_id: o.buyer_id,
        type: 'offer_declined' as const,
        message: `The listing "${listing.title}" has been marked as sold.`,
        link: `/listings/${listingId}`,
      }))
    )
    if (notifError1) console.error('[listings] notification insert failed (markAsSold):', notifError1)
    for (const o of activeOffers) {
      const profile = o.profiles as unknown as { email: string } | null
      if (profile?.email) await emailListingSold(profile.email, listing.title, listingId)
    }
  }

  revalidatePath(`/listings/${listingId}`)
  revalidatePath('/inbox')
  revalidatePath('/my-listings')
}

export async function completeSale(listingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: listing } = await supabase
    .from('listings')
    .select('id, seller_id, status')
    .eq('id', listingId)
    .single()

  if (!listing || listing.seller_id !== user.id) throw new Error('Unauthorized')
  if (listing.status !== 'claimed') throw new Error('Listing is not claimed')

  const { error } = await supabase.from('listings').update({ status: 'sold' }).eq('id', listingId)
  if (error) throw new Error(error.message)

  revalidatePath(`/listings/${listingId}`)
  revalidatePath('/inbox')
  revalidatePath('/my-listings')
  revalidatePath('/')
}

export async function relistFromAccepted(listingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: listing } = await supabase
    .from('listings')
    .select('id, seller_id, title, status')
    .eq('id', listingId)
    .single()

  if (!listing || listing.seller_id !== user.id) throw new Error('Unauthorized')
  if (listing.status !== 'claimed') throw new Error('Listing is not claimed')

  const service = createServiceClient()

  const { data: acceptedOffer } = await service
    .from('offers')
    .select('id')
    .eq('listing_id', listingId)
    .eq('status', 'accepted')
    .maybeSingle()

  if (acceptedOffer) {
    await service.from('offers').update({ status: 'declined' }).eq('id', acceptedOffer.id)
    await service.from('offer_events').insert({
      offer_id: acceptedOffer.id,
      actor_id: user.id,
      event_type: 'declined' as const,
      amount: null,
      message: null,
    })
  }

  await service.from('listings').update({ status: 'active' }).eq('id', listingId)

  const { data: savedRows } = await service
    .from('saved_listings')
    .select('user_id, profiles(email)')
    .eq('listing_id', listingId)
    .neq('user_id', user.id)

  if (savedRows && savedRows.length > 0) {
    const { error: notifError2 } = await service.from('notifications').insert(
      savedRows.map(row => ({
        user_id: row.user_id,
        type: 'listing_relisted',
        message: `A listing you saved is available again.`,
        link: `/listings/${listingId}`,
      }))
    )
    if (notifError2) console.error('[listings] notification insert failed (relistFromAccepted):', notifError2)
    for (const row of savedRows) {
      const profile = row.profiles as unknown as { email: string } | null
      if (profile?.email) await emailListingRelisted(profile.email, listing.title, listingId)
    }
  }

  revalidatePath(`/listings/${listingId}`)
  revalidatePath('/inbox')
  revalidatePath('/my-listings')
  revalidatePath('/')
}

export async function relistListing(listingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: listing } = await supabase
    .from('listings')
    .select('id, seller_id, title, status')
    .eq('id', listingId)
    .single()

  if (!listing || listing.seller_id !== user.id) throw new Error('Unauthorized')
  if (listing.status === 'active') throw new Error('Listing is already active')

  const service = createServiceClient()
  await service.from('listings').update({ status: 'active' }).eq('id', listingId)

  const { data: savedRows } = await service
    .from('saved_listings')
    .select('user_id, profiles(email)')
    .eq('listing_id', listingId)
    .neq('user_id', user.id)

  if (savedRows && savedRows.length > 0) {
    const { error: notifError3 } = await service.from('notifications').insert(
      savedRows.map(row => ({
        user_id: row.user_id,
        type: 'listing_relisted',
        message: `A listing you saved is available again.`,
        link: `/listings/${listingId}`,
      }))
    )
    if (notifError3) console.error('[listings] notification insert failed (relistListing):', notifError3)
    for (const row of savedRows) {
      const profile = row.profiles as unknown as { email: string } | null
      if (profile?.email) await emailListingRelisted(profile.email, listing.title, listingId)
    }
  }

  revalidatePath('/my-listings')
  revalidatePath('/')
}

export async function deleteMyListing(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: listing } = await supabase
    .from('listings')
    .select('seller_id, photo_keys')
    .eq('id', id)
    .single()

  if (!listing || listing.seller_id !== user.id) throw new Error('Unauthorized')

  if (listing.photo_keys?.length > 0) {
    await deleteObjects(listing.photo_keys.filter((key: unknown) => isOwnedObjectKey(key, user.id, 'listings')))
  }

  await supabase.from('listings').delete().eq('id', id)

  revalidatePath('/my-listings')
  revalidatePath('/')
}
