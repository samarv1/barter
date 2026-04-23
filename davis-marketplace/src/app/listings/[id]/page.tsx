import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPublicUrl } from '@/lib/s3'

const AVAILABILITY_LABELS: Record<string, string> = {
  asap: 'ASAP — available now',
  beginning_of_summer: 'Beginning of summer (early June)',
  end_of_summer: 'End of summer (late August)',
}

function formatPrice(price: number | null, isFree: boolean) {
  if (isFree || price === null) return 'Free'
  return `$${Number(price).toFixed(2)}`
}

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: listing } = await supabase
    .from('listings')
    .select('*, profiles(display_name, email)')
    .eq('id', id)
    .single()

  if (!listing) notFound()

  const { data: { user } } = await supabase.auth.getUser()
  const isSeller = user?.id === listing.seller_id

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg text-gray-900">Davis Marketplace</Link>
        <div className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <Link href="/notifications" className="text-gray-600 hover:text-gray-900">Notifications</Link>
              <Link href="/profile" className="text-gray-600 hover:text-gray-900">Profile</Link>
            </>
          ) : (
            <Link href="/auth/login" className="text-gray-600 hover:text-gray-900">Sign in</Link>
          )}
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/" className="text-sm text-blue-600 hover:underline mb-6 inline-block">
          ← Back to listings
        </Link>

        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {/* Photo gallery */}
          <div className="flex gap-2 p-4 overflow-x-auto">
            {listing.photo_keys.map((key: string, i: number) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={key}
                src={getPublicUrl(key)}
                alt={`${listing.title} photo ${i + 1}`}
                className="h-72 w-auto rounded-md object-cover flex-shrink-0"
              />
            ))}
          </div>

          <div className="p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{listing.title}</h1>
                <p className="text-2xl font-bold text-blue-600 mt-1">
                  {formatPrice(listing.price, listing.is_free)}
                </p>
              </div>
              {listing.status === 'claimed' && (
                <span className="shrink-0 bg-gray-100 text-gray-600 text-sm font-medium px-3 py-1 rounded-full">
                  Claimed
                </span>
              )}
            </div>

            <div className="flex gap-4 text-sm text-gray-600">
              <span className="capitalize">{listing.category}</span>
              <span>·</span>
              <span>{AVAILABILITY_LABELS[listing.availability] ?? listing.availability}</span>
            </div>

            {listing.description && (
              <p className="text-gray-700 text-sm whitespace-pre-wrap">{listing.description}</p>
            )}

            <div className="pt-2 border-t border-gray-100 text-sm text-gray-500">
              Posted by {(listing.profiles as { display_name: string | null; email: string })?.display_name || 'a Davis student'}
            </div>

            {!isSeller && listing.status === 'active' && (
              <div className="pt-2">
                {!user ? (
                  <Link
                    href={`/auth/login?redirectTo=/listings/${id}`}
                    className="block w-full text-center rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Sign in to make an offer
                  </Link>
                ) : (
                  <p className="text-sm text-gray-500 italic">
                    Offer flow coming soon.
                  </p>
                )}
              </div>
            )}

            {isSeller && (
              <div className="pt-2 flex gap-3">
                <Link
                  href={`/listings/${id}/edit`}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Edit listing
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
