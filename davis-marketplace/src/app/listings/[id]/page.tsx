import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPublicUrl } from '@/lib/s3'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import Navbar from '@/components/nav/Navbar'
import DeleteButton from './DeleteButton'

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
    .select('*, profiles(display_name, email, avatar_url)')
    .eq('id', id)
    .single()

  if (!listing) notFound()

  const { data: { user } } = await supabase.auth.getUser()
  const isSeller = user?.id === listing.seller_id

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground mb-6 inline-block">
          ← Back to listings
        </Link>

        <Card className="p-0 gap-0 overflow-hidden">
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

          <CardContent className="p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold">{listing.title}</h1>
                <p className="text-2xl font-bold text-primary mt-1">
                  {formatPrice(listing.price, listing.is_free)}
                </p>
              </div>
              {listing.status === 'claimed' && (
                <Badge variant="secondary" className="shrink-0">Claimed</Badge>
              )}
            </div>

            <div className="flex gap-4 text-sm text-muted-foreground">
              <span className="capitalize">{listing.category}</span>
              <span>·</span>
              <span>{AVAILABILITY_LABELS[listing.availability] ?? listing.availability}</span>
            </div>

            {listing.description && (
              <p className="text-sm whitespace-pre-wrap">{listing.description}</p>
            )}

            <div className="pt-2 border-t flex items-center gap-2">
              {(() => {
                const seller = listing.profiles as { display_name: string | null; email: string; avatar_url: string | null }
                return (
                  <>
                    {seller?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={seller.avatar_url}
                        alt={seller.display_name ?? 'Seller'}
                        className="h-7 w-7 rounded-full object-cover shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    ) : null}
                    <span className="text-sm text-muted-foreground">
                      Posted by <span className="text-foreground font-medium">{seller?.display_name || 'a Davis student'}</span>
                    </span>
                  </>
                )
              })()}
            </div>

            {!isSeller && listing.status === 'active' && (
              <div className="pt-2">
                {!user ? (
                  <Link
                    href={`/auth/login?redirectTo=/listings/${id}`}
                    className={cn(buttonVariants(), 'w-full justify-center')}
                  >
                    Sign in to make an offer
                  </Link>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    Offer flow coming soon.
                  </p>
                )}
              </div>
            )}

            {isSeller && (
              <div className="pt-2 flex flex-wrap gap-3 items-center">
                <Link
                  href={`/listings/${id}/edit`}
                  className={buttonVariants({ variant: 'outline' })}
                >
                  Edit listing
                </Link>
                <DeleteButton id={id} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
