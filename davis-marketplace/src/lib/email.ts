import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL ?? 'Davis Marketplace <onboarding@resend.dev>'
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

async function send(to: string, subject: string, text: string) {
  if (!process.env.RESEND_API_KEY) return
  try {
    await resend.emails.send({ from: FROM, to: [to], subject, text })
  } catch (err) {
    console.error('[email] send failed', err)
  }
}

export async function emailNewOffer(to: string, listingTitle: string, amount: number, listingId: string) {
  await send(
    to,
    `New offer on "${listingTitle}"`,
    `Someone made an offer of $${amount.toFixed(2)} on your listing "${listingTitle}".\n\nView and respond: ${BASE_URL}/listings/${listingId}\n\nOr manage all your offers: ${BASE_URL}/inbox`
  )
}

export async function emailListingClaimed(to: string, listingTitle: string, amount: number, isFree: boolean, listingId: string) {
  const priceText = isFree ? 'free' : `$${amount.toFixed(2)}`
  await send(
    to,
    `Your listing was claimed — "${listingTitle}"`,
    `Your listing "${listingTitle}" was claimed at the listed price (${priceText}).\n\nView it: ${BASE_URL}/listings/${listingId}`
  )
}

export async function emailOfferAccepted(to: string, listingTitle: string, amount: number, listingId: string) {
  await send(
    to,
    `Your offer was accepted — "${listingTitle}"`,
    `Your offer of $${amount.toFixed(2)} on "${listingTitle}" was accepted! Reach out to the seller to arrange pickup.\n\nView listing: ${BASE_URL}/listings/${listingId}`
  )
}

export async function emailOfferDeclined(to: string, listingTitle: string, listingId: string) {
  await send(
    to,
    `Offer update on "${listingTitle}"`,
    `Your offer on "${listingTitle}" was declined.\n\nView listing: ${BASE_URL}/listings/${listingId}`
  )
}

export async function emailCounterOffer(to: string, listingTitle: string, amount: number, listingId: string) {
  await send(
    to,
    `Counter-offer on "${listingTitle}"`,
    `A counter-offer of $${amount.toFixed(2)} was made on "${listingTitle}".\n\nView and respond: ${BASE_URL}/inbox`
  )
}

export async function emailListingSold(to: string, listingTitle: string, listingId: string) {
  await send(
    to,
    `Listing update — "${listingTitle}"`,
    `The listing "${listingTitle}" has been marked as sold. Your offer was not selected.\n\nView listing: ${BASE_URL}/listings/${listingId}`
  )
}
