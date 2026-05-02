'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  emailNewOffer,
  emailListingClaimed,
  emailOfferAccepted,
  emailOfferDeclined,
  emailCounterOffer,
} from '@/lib/email'

export async function claimAtListedPrice(listingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: listing } = await supabase
    .from('listings')
    .select('id, seller_id, title, price, is_free, status')
    .eq('id', listingId)
    .single()

  if (!listing) throw new Error('Listing not found')
  if (listing.status !== 'active') throw new Error('Listing is no longer active')
  if (listing.seller_id === user.id) throw new Error('Cannot claim your own listing')

  const amount = listing.is_free ? 0 : Number(listing.price ?? 0)

  const { data: offer, error: offerError } = await supabase
    .from('offers')
    .insert({ listing_id: listingId, buyer_id: user.id, amount, status: 'accepted', current_turn: 'seller', message: null })
    .select('id')
    .single()

  if (offerError) {
    if (offerError.code === '23505') throw new Error('You already have an offer on this listing')
    throw offerError
  }

  const service = await createServiceClient()

  await service.from('offer_events').insert({
    offer_id: offer.id, actor_id: user.id, event_type: 'accepted', amount, message: null,
  })
  await service.from('listings').update({ status: 'claimed' }).eq('id', listingId)

  const { data: otherOffers } = await service
    .from('offers')
    .select('id, buyer_id, profiles(email)')
    .eq('listing_id', listingId)
    .in('status', ['pending', 'countered'])
    .neq('id', offer.id)

  if (otherOffers && otherOffers.length > 0) {
    await service.from('offers').update({ status: 'declined' }).in('id', otherOffers.map(o => o.id))
    await service.from('offer_events').insert(
      otherOffers.map(o => ({ offer_id: o.id, actor_id: user.id, event_type: 'declined' as const, amount: null, message: null }))
    )
    await service.from('notifications').insert(
      otherOffers.map(o => ({
        user_id: o.buyer_id,
        type: 'offer_declined' as const,
        message: `Your offer on "${listing.title}" was not selected — the listing has been claimed.`,
        link: `/listings/${listingId}`,
      }))
    )
    for (const o of otherOffers) {
      const profile = o.profiles as unknown as { email: string } | null
      if (profile?.email) await emailOfferDeclined(profile.email, listing.title, listingId)
    }
  }

  const { data: sellerProfile } = await supabase.from('profiles').select('email').eq('id', listing.seller_id).single()
  await service.from('notifications').insert({
    user_id: listing.seller_id,
    type: 'offer_accepted',
    message: `Your listing "${listing.title}" has been claimed at the listed price.`,
    link: `/listings/${listingId}`,
  })
  if (sellerProfile?.email) {
    await emailListingClaimed(sellerProfile.email, listing.title, amount, listing.is_free, listingId)
  }

  revalidatePath(`/listings/${listingId}`)
  revalidatePath('/inbox')
}

export async function makeOffer(listingId: string, amount: number, message?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: listing } = await supabase
    .from('listings')
    .select('id, seller_id, title, status')
    .eq('id', listingId)
    .single()

  if (!listing) throw new Error('Listing not found')
  if (listing.status !== 'active') throw new Error('Listing is no longer active')
  if (listing.seller_id === user.id) throw new Error('Cannot offer on your own listing')

  const { data: offer, error: offerError } = await supabase
    .from('offers')
    .insert({ listing_id: listingId, buyer_id: user.id, amount, status: 'pending', current_turn: 'seller', message: message || null })
    .select('id')
    .single()

  if (offerError) {
    if (offerError.code === '23505') throw new Error('You already have an offer on this listing')
    throw offerError
  }

  const service = await createServiceClient()

  await service.from('offer_events').insert({
    offer_id: offer.id, actor_id: user.id, event_type: 'offer', amount, message: message || null,
  })

  const { data: sellerProfile } = await supabase.from('profiles').select('email').eq('id', listing.seller_id).single()
  await service.from('notifications').insert({
    user_id: listing.seller_id,
    type: 'new_offer',
    message: `New offer of $${amount.toFixed(2)} on your listing "${listing.title}".`,
    link: `/listings/${listingId}`,
  })
  if (sellerProfile?.email) await emailNewOffer(sellerProfile.email, listing.title, amount, listingId)

  revalidatePath(`/listings/${listingId}`)
  revalidatePath('/inbox')
}

export async function respondToOffer(
  offerId: string,
  action: 'accept' | 'decline' | 'counter',
  amount?: number,
  message?: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: offer } = await supabase
    .from('offers')
    .select('id, listing_id, buyer_id, amount, status, current_turn, listings(id, seller_id, title)')
    .eq('id', offerId)
    .single()

  if (!offer) throw new Error('Offer not found')

  const listing = offer.listings as unknown as { id: string; seller_id: string; title: string }
  const isSeller = user.id === listing.seller_id
  const isBuyer = user.id === offer.buyer_id

  if (!isSeller && !isBuyer) throw new Error('Not authorized')
  if (isSeller && offer.current_turn !== 'seller') throw new Error('Not your turn')
  if (isBuyer && offer.current_turn !== 'buyer') throw new Error('Not your turn')

  const service = await createServiceClient()

  // Fetch both profiles for emails
  const [{ data: buyerProfile }, { data: sellerProfile }] = await Promise.all([
    supabase.from('profiles').select('email').eq('id', offer.buyer_id).single(),
    supabase.from('profiles').select('email').eq('id', listing.seller_id).single(),
  ])

  if (action === 'accept') {
    await supabase.from('offers').update({ status: 'accepted' }).eq('id', offerId)
    await service.from('offer_events').insert({
      offer_id: offerId, actor_id: user.id, event_type: 'accepted', amount: offer.amount, message: null,
    })
    await service.from('listings').update({ status: 'claimed' }).eq('id', listing.id)

    const { data: otherOffers } = await service
      .from('offers')
      .select('id, buyer_id, profiles(email)')
      .eq('listing_id', listing.id)
      .in('status', ['pending', 'countered'])
      .neq('id', offerId)

    if (otherOffers && otherOffers.length > 0) {
      await service.from('offers').update({ status: 'declined' }).in('id', otherOffers.map(o => o.id))
      await service.from('offer_events').insert(
        otherOffers.map(o => ({ offer_id: o.id, actor_id: user.id, event_type: 'declined' as const, amount: null, message: null }))
      )
      await service.from('notifications').insert(
        otherOffers.map(o => ({
          user_id: o.buyer_id,
          type: 'offer_declined' as const,
          message: `Your offer on "${listing.title}" was not selected — the listing has been claimed.`,
          link: `/listings/${listing.id}`,
        }))
      )
      for (const o of otherOffers) {
        const profile = o.profiles as unknown as { email: string } | null
        if (profile?.email) await emailOfferDeclined(profile.email, listing.title, listing.id)
      }
    }

    const notifyUserId = isSeller ? offer.buyer_id : listing.seller_id
    await service.from('notifications').insert({
      user_id: notifyUserId,
      type: 'offer_accepted',
      message: isSeller
        ? `Your offer on "${listing.title}" was accepted! Arrange pickup with the seller.`
        : `Your offer on "${listing.title}" has been accepted.`,
      link: `/listings/${listing.id}`,
    })
    if (isSeller && buyerProfile?.email) {
      await emailOfferAccepted(buyerProfile.email, listing.title, Number(offer.amount), listing.id)
    }
  } else if (action === 'decline') {
    await supabase.from('offers').update({ status: 'declined' }).eq('id', offerId)
    await service.from('offer_events').insert({
      offer_id: offerId, actor_id: user.id, event_type: 'declined', amount: null, message: null,
    })
    const notifyUserId = isSeller ? offer.buyer_id : listing.seller_id
    await service.from('notifications').insert({
      user_id: notifyUserId,
      type: 'offer_declined',
      message: isSeller
        ? `Your offer on "${listing.title}" was declined.`
        : `The seller declined your offer on "${listing.title}".`,
      link: `/listings/${listing.id}`,
    })
    if (isSeller && buyerProfile?.email) await emailOfferDeclined(buyerProfile.email, listing.title, listing.id)
    if (!isSeller && sellerProfile?.email) await emailOfferDeclined(sellerProfile.email, listing.title, listing.id)
  } else if (action === 'counter') {
    if (amount === undefined) throw new Error('Amount required for counter')
    const nextTurn = isSeller ? 'buyer' : 'seller'
    await supabase.from('offers').update({ status: 'countered', current_turn: nextTurn, amount, message: message || null }).eq('id', offerId)
    await service.from('offer_events').insert({
      offer_id: offerId, actor_id: user.id, event_type: 'counter', amount, message: message || null,
    })
    const notifyUserId = isSeller ? offer.buyer_id : listing.seller_id
    await service.from('notifications').insert({
      user_id: notifyUserId,
      type: 'offer_countered',
      message: `Counter-offer of $${amount.toFixed(2)} on "${listing.title}".`,
      link: `/listings/${listing.id}`,
    })
    if (isSeller && buyerProfile?.email) await emailCounterOffer(buyerProfile.email, listing.title, amount, listing.id)
    if (!isSeller && sellerProfile?.email) await emailCounterOffer(sellerProfile.email, listing.title, amount, listing.id)
  }

  revalidatePath(`/listings/${listing.id}`)
  revalidatePath('/inbox')
}
