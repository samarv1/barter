import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/nav/Navbar'
import { Button } from '@/components/ui/button'
import MyListingCard from './MyListingCard'

export const metadata = { title: 'My Listings — Davis Marketplace' }

export default async function MyListingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?redirectTo=/my-listings')

  const { data: listings } = await supabase
    .from('listings')
    .select('id, title, price, is_free, category, photo_keys, status, created_at')
    .eq('seller_id', user.id)
    .order('created_at', { ascending: false })

  const listingIds = listings?.map(l => l.id) ?? []

  const { data: offers } = listingIds.length > 0
    ? await supabase
        .from('offers')
        .select('listing_id, current_turn')
        .in('listing_id', listingIds)
        .in('status', ['pending', 'countered'])
    : { data: [] }

  const offerMap = new Map<string, { count: number; yourTurn: boolean }>()
  for (const o of offers ?? []) {
    const prev = offerMap.get(o.listing_id) ?? { count: 0, yourTurn: false }
    offerMap.set(o.listing_id, {
      count: prev.count + 1,
      yourTurn: prev.yourTurn || o.current_turn === 'seller',
    })
  }

  const active = listings?.filter(l => l.status === 'active') ?? []
  const claimed = listings?.filter(l => l.status === 'claimed') ?? []

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <h1 className="text-xl font-bold">My Listings</h1>

        {/* Active listings */}
        {active.length > 0 ? (
          <section>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {active.map(l => (
                <MyListingCard key={l.id} listing={l} offerSummary={offerMap.get(l.id)} />
              ))}
            </div>
          </section>
        ) : (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg">No active listings.</p>
            <Button asChild className="mt-4">
              <Link href="/listings/new">Post your first listing</Link>
            </Button>
          </div>
        )}

        {/* Claimed / sold */}
        {claimed.length > 0 && (
          <section className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Sold / Claimed
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 opacity-60">
              {claimed.map(l => (
                <MyListingCard key={l.id} listing={l} offerSummary={undefined} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
