import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPublicUrl } from '@/lib/s3'

const CATEGORIES = [
  { value: '', label: 'All categories' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'electronics', label: 'Electronics' },
  { value: 'clothing', label: 'Clothing' },
  { value: 'books', label: 'Books' },
  { value: 'appliances', label: 'Appliances' },
  { value: 'bikes', label: 'Bikes' },
  { value: 'sports', label: 'Sports' },
  { value: 'other', label: 'Other' },
]

const AVAILABILITY = [
  { value: '', label: 'Any time' },
  { value: 'asap', label: 'ASAP' },
  { value: 'beginning_of_summer', label: 'Beginning of summer' },
  { value: 'end_of_summer', label: 'End of summer' },
]

function formatPrice(price: number | null, isFree: boolean) {
  if (isFree || price === null) return 'Free'
  return `$${Number(price).toFixed(0)}`
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; availability?: string }>
}) {
  const { q, category, availability } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: listings } = await supabase.rpc('search_listings', {
    keyword: q || null,
    filter_category: category || null,
    filter_availability: availability || null,
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg text-gray-900">Davis Marketplace</Link>
        <div className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <Link href="/notifications" className="text-gray-600 hover:text-gray-900">Notifications</Link>
              <Link href="/profile" className="text-gray-600 hover:text-gray-900">Profile</Link>
              <Link href="/listings/new" className="rounded-md bg-blue-600 px-3 py-1.5 text-white font-medium hover:bg-blue-700">
                Post listing
              </Link>
            </>
          ) : (
            <>
              <Link href="/auth/login" className="text-gray-600 hover:text-gray-900">Sign in</Link>
              <Link href="/auth/signup" className="rounded-md bg-blue-600 px-3 py-1.5 text-white font-medium hover:bg-blue-700">
                Sign up
              </Link>
            </>
          )}
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <form method="GET" className="flex flex-wrap gap-3">
          <input
            name="q"
            type="text"
            defaultValue={q}
            placeholder="Search listings…"
            className="flex-1 min-w-48 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <select
            name="category"
            defaultValue={category}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
          >
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select
            name="availability"
            defaultValue={availability}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
          >
            {AVAILABILITY.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            Search
          </button>
          {(q || category || availability) && (
            <Link href="/" className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              Clear
            </Link>
          )}
        </form>

        {!listings || listings.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg">No listings yet.</p>
            {user && (
              <Link href="/listings/new" className="mt-3 inline-block text-blue-600 hover:underline text-sm">
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
            }) => (
              <Link
                key={listing.id}
                href={`/listings/${listing.id}`}
                className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="aspect-square bg-gray-100">
                  {listing.photo_keys[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={getPublicUrl(listing.photo_keys[0])}
                      alt={listing.title}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="p-3 space-y-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{listing.title}</p>
                  <p className="text-sm font-bold text-gray-900">
                    {formatPrice(listing.price, listing.is_free)}
                  </p>
                  <p className="text-xs text-gray-500 capitalize">{listing.category}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
