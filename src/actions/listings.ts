'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { deleteObjects } from '@/lib/s3'
import { sendMarketplaceEmails, type MarketplaceResult } from '@/lib/marketplace-notifications'
import { isOwnedObjectKey, validateListingInput } from '@/lib/validation'

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

  const { data: updated, error } = await supabase
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
    .eq('status', 'active')
    .select('id')
    .maybeSingle()

  if (!error && !updated) throw new Error('Only active listings can be edited')
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

  const { error } = await supabase.from('listings').delete().eq('id', id)
  if (error) throw new Error(error.message)

  redirect('/')
}

async function transitionListing(listingId: string, action: 'mark_sold' | 'complete' | 'relist' | 'relist_claimed') {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('transition_listing', {
    p_listing_id: listingId, p_action: action,
  })
  if (error) throw new Error(error.message)
  const result = data as MarketplaceResult
  revalidatePath(`/listings/${listingId}`)
  revalidatePath('/inbox')
  revalidatePath('/my-listings')
  revalidatePath('/')
  if (action !== 'complete') {
    await sendMarketplaceEmails(result, action === 'mark_sold' ? 'sold' : 'relist')
  }
}

export async function markAsSold(listingId: string) {
  await transitionListing(listingId, 'mark_sold')
}

export async function completeSale(listingId: string) {
  await transitionListing(listingId, 'complete')
}

export async function relistFromAccepted(listingId: string) {
  await transitionListing(listingId, 'relist_claimed')
}

export async function relistListing(listingId: string) {
  await transitionListing(listingId, 'relist')
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

  const { error } = await supabase.from('listings').delete().eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/my-listings')
  revalidatePath('/')
}
