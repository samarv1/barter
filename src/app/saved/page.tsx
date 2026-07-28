import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/nav/Navbar'
import SavedListingCard from './SavedListingCard'

export const metadata = { title: 'Saved — Barter' }

export default async function SavedPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?redirectTo=/saved')

  const { data: rows } = await supabase
    .from('saved_listings')
    .select('listing_id, listings(id, title, price, is_free, category, photo_keys, status)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  type ListingRow = {
    id: string; title: string; price: number | null; is_free: boolean;
    category: string; photo_keys: string[]; status: string
  }
  const listings = (rows ?? [])
    .map(r => r.listings as unknown as ListingRow)
    .filter(Boolean)

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-xl font-bold">Saved</h1>

        {listings.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg">No saved listings yet.</p>
            <Link href="/" className="text-sm text-primary hover:underline mt-2 inline-block">
              Browse listings
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {listings.map(l => (
              <SavedListingCard key={l.id} listing={l} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
