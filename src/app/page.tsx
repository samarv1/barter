import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPublicUrl } from '@/lib/s3'
import { Card, CardContent } from '@/components/ui/card'
import Navbar from '@/components/nav/Navbar'
import FilterBar from '@/components/listings/FilterBar'

function formatPrice(price: number | null, isFree: boolean) {
  if (isFree || price === null) return 'Free'
  return `$${Number(price).toFixed(0)}`
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; availability?: string }>
}) {
  const { category, availability } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: listings } = await supabase.rpc('search_listings', {
    keyword: null,
    filter_category: category || null,
    filter_availability: availability || null,
  })

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <FilterBar
          initialCategory={category}
          initialAvailability={availability}
        />

        {!listings || listings.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg">No listings yet.</p>
            {user && (
              <Link href="/listings/new" className="mt-3 inline-block text-primary hover:underline text-sm">
                Be the first to post one →
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {listings.map((listing: {
              id: string
              title: string
              price: number | null
              is_free: boolean
              category: string
              availability: string
              photo_keys: string[]
              status: string
            }) => (
              <Link key={listing.id} href={`/listings/${listing.id}`}>
                <Card className={`p-0 gap-0 hover:shadow-md transition-shadow cursor-pointer relative${listing.status === 'claimed' ? ' opacity-60' : ''}`}>
                  {listing.status === 'claimed' && (
                    <div className="absolute top-2 left-2 z-10">
                      <span className="bg-amber-500 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                        Pending pickup
                      </span>
                    </div>
                  )}
                  <div className="aspect-square bg-muted overflow-hidden rounded-t-xl">
                    {listing.photo_keys[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getPublicUrl(listing.photo_keys[0])}
                        alt={listing.title}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <CardContent className="p-3 space-y-1">
                    <p className="text-sm font-medium truncate">{listing.title}</p>
                    <p className="text-sm font-bold">
                      {formatPrice(listing.price, listing.is_free)}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">{listing.category}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
