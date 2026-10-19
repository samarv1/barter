'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { sendMarketplaceEmails, type MarketplaceResult } from '@/lib/marketplace-notifications'

function revalidateMarketplace(listingId: string) {
  revalidatePath(`/listings/${listingId}`)
  revalidatePath('/inbox')
  revalidatePath('/my-listings')
  revalidatePath('/')
}

export async function claimAtListedPrice(listingId: string) {
  const supabase = await createClient()
  // RPCs derive the actor from the caller's JWT, not a service-role client.
  const { data, error } = await supabase.rpc('submit_offer', {
    p_listing_id: listingId, p_offer_type: 'claim',
  })
  if (error) throw new Error(error.message)
  const result = data as MarketplaceResult
  revalidateMarketplace(result.listing_id)
  await sendMarketplaceEmails(result, 'claim')
}

export async function makeOffer(listingId: string, amount: number, message?: string) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Offer amount must be greater than $0')
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('submit_offer', {
    p_listing_id: listingId, p_offer_type: 'negotiation', p_amount: amount, p_message: message || null,
  })
  if (error) throw new Error(error.message)
  const result = data as MarketplaceResult
  revalidateMarketplace(result.listing_id)
  await sendMarketplaceEmails(result, 'offer')
}

export async function respondToOffer(
  offerId: string,
  action: 'accept' | 'decline' | 'counter',
  amount?: number,
  message?: string
) {
  if (!['accept', 'decline', 'counter'].includes(action)) throw new Error('Invalid response')
  if (action === 'counter' && (amount === undefined || !Number.isFinite(amount) || amount <= 0)) {
    throw new Error('Counter amount must be greater than $0')
  }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('respond_to_offer', {
    p_offer_id: offerId, p_action: action, p_amount: amount ?? null, p_message: message || null,
  })
  if (error) throw new Error(error.message)
  const result = data as MarketplaceResult
  revalidateMarketplace(result.listing_id)
  await sendMarketplaceEmails(result, action)
}
