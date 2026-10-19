import { createServiceClient } from '@/lib/supabase/server'
import {
  emailNewOffer, emailClaimAtPrice, emailOfferAccepted, emailOfferDeclined,
  emailCounterOffer, emailListingSold, emailListingRelisted,
} from '@/lib/email'

export type MarketplaceResult = {
  listing_id: string
  title: string
  amount?: number
  is_free?: boolean
  recipient_ids: string[]
  declined_recipient_ids?: string[]
}

type EmailKind = 'offer' | 'claim' | 'accept' | 'decline' | 'counter' | 'sold' | 'relist'

// The database transaction has already committed. Email is best effort, so a
// delivery failure must not report a failed sale and encourage duplicate retries.
export async function sendMarketplaceEmails(result: MarketplaceResult, kind: EmailKind) {
  try {
    const service = createServiceClient()
    const recipients = [...new Set([...result.recipient_ids, ...(result.declined_recipient_ids ?? [])])]
    if (recipients.length === 0) return
    const { data: profiles, error } = await service.from('profiles').select('id, email').in('id', recipients)
    if (error) throw error
    await Promise.all((profiles ?? []).map(async (profile) => {
      const emailKind = result.declined_recipient_ids?.includes(profile.id) ? 'decline' : kind
      const { title, listing_id: id } = result
      const amount = Number(result.amount ?? 0)
      switch (emailKind) {
        case 'offer': return emailNewOffer(profile.email, title, amount, id)
        case 'claim': return emailClaimAtPrice(profile.email, title, amount, Boolean(result.is_free), id)
        case 'accept': return emailOfferAccepted(profile.email, title, amount, id)
        case 'decline': return emailOfferDeclined(profile.email, title, id)
        case 'counter': return emailCounterOffer(profile.email, title, amount, id)
        case 'sold': return emailListingSold(profile.email, title, id)
        case 'relist': return emailListingRelisted(profile.email, title, id)
      }
    }))
  } catch (error) {
    console.error('[marketplace] post-commit email delivery failed:', error)
  }
}
