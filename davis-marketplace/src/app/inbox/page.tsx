import { redirect } from 'next/navigation'
import Navbar from '@/components/nav/Navbar'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import ThreadList from './ThreadList'

export const metadata = { title: 'Inbox — Barter' }

export default async function InboxPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?redirectTo=/inbox')

  // All offers I'm involved in (RLS returns only buyer + seller rows)
  const { data: rawThreads } = await supabase
    .from('offers')
    .select(`
      id, listing_id, buyer_id, amount, offer_type, status, current_turn, message, updated_at,
      listings(id, title, photo_keys, status, seller_id, profiles(display_name, avatar_url, email, phone)),
      profiles!buyer_id(display_name, avatar_url, email, phone),
      offer_events(id, actor_id, event_type, amount, message, created_at)
    `)
    .order('updated_at', { ascending: false })

  // Mark all unread notifications as read now that user is viewing inbox
  const service = await createServiceClient()
  await service
    .from('notifications')
    .update({ read: true })
    .eq('user_id', user.id)
    .eq('read', false)

  const threads = (rawThreads ?? []) as unknown as Thread[]

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-2">
        <h1 className="text-xl font-bold mb-6">Inbox</h1>
        <ThreadList threads={threads} userId={user.id} />
      </div>
    </div>
  )
}

// Type exported for ThreadList
export type OfferEvent = {
  id: string
  actor_id: string
  event_type: 'offer' | 'counter' | 'accepted' | 'declined'
  amount: number | null
  message: string | null
  created_at: string
}

export type Thread = {
  id: string
  listing_id: string
  buyer_id: string
  amount: number
  offer_type: 'claim' | 'negotiation'
  status: 'pending' | 'accepted' | 'declined' | 'countered'
  current_turn: 'buyer' | 'seller'
  message: string | null
  updated_at: string
  listings: {
    id: string
    title: string
    photo_keys: string[]
    status: string
    seller_id: string
    profiles: { display_name: string | null; avatar_url: string | null; email: string; phone: string | null } | null
  }
  profiles: { display_name: string | null; avatar_url: string | null; email: string; phone: string | null } | null
  offer_events: OfferEvent[]
}
