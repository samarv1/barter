'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { deleteObjects } from '@/lib/s3'
import { emailListingSold } from '@/lib/email'

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
    await deleteObjects(listing.photo_keys)
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

  const service = await createServiceClient()
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
    await service.from('notifications').insert(
      activeOffers.map(o => ({
        user_id: o.buyer_id,
        type: 'offer_declined' as const,
        message: `The listing "${listing.title}" has been marked as sold.`,
        link: `/listings/${listingId}`,
      }))
    )
    for (const o of activeOffers) {
      const profile = o.profiles as unknown as { email: string } | null
      if (profile?.email) await emailListingSold(profile.email, listing.title, listingId)
    }
  }

  revalidatePath(`/listings/${listingId}`)
  revalidatePath('/inbox')
  revalidatePath('/my-listings')
}

export async function relistListing(listingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: listing } = await supabase
    .from('listings')
    .select('id, seller_id, status')
    .eq('id', listingId)
    .single()

  if (!listing || listing.seller_id !== user.id) throw new Error('Unauthorized')
  if (listing.status === 'active') throw new Error('Listing is already active')

  await supabase.from('listings').update({ status: 'active' }).eq('id', listingId)

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
    await deleteObjects(listing.photo_keys)
  }

  await supabase.from('listings').delete().eq('id', id)

  revalidatePath('/my-listings')
  revalidatePath('/')
}
