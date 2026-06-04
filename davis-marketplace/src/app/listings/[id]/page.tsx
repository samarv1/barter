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
import RelistButton from './RelistButton'
import MarkSoldButton from './MarkSoldButton'
import OfferSection from './OfferSection'
import OffersPanel from './OffersPanel'
import SaveButton from './SaveButton'

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
    .select('*, profiles(display_name, email, avatar_url, phone)')
    .eq('id', id)
    .single()

  if (!listing) notFound()

  const { data: { user } } = await supabase.auth.getUser()
  const isSeller = user?.id === listing.seller_id

  // Buyer: check if they saved this listing
  let isSaved = false
  if (user && !isSeller) {
    const { data: savedRow } = await supabase
      .from('saved_listings')
      .select('id')
      .eq('listing_id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    isSaved = !!savedRow
  }

  // Buyer: fetch their existing offer + its events
  let buyerOffer = null
  let buyerOfferEvents: {
    id: string; actor_id: string; event_type: 'offer' | 'counter' | 'accepted' | 'declined';
    amount: number | null; message: string | null; created_at: string
  }[] = []
  if (user && !isSeller) {
    const { data: offer } = await supabase
      .from('offers')
      .select('id, amount, offer_type, status, current_turn, message')
      .eq('listing_id', id)
      .eq('buyer_id', user.id)
      .maybeSingle()
    if (offer) {
      buyerOffer = offer
      const { data: events } = await supabase
        .from('offer_events')
        .select('id, actor_id, event_type, amount, message, created_at')
        .eq('offer_id', offer.id)
        .order('created_at', { ascending: true })
      buyerOfferEvents = (events ?? []) as typeof buyerOfferEvents
    }
  }

  // Seller: fetch all active offers with buyer profiles + events
  let sellerOffers: {
    id: string; buyer_id: string; amount: number; offer_type: 'claim' | 'negotiation';
    status: 'pending' | 'countered'; current_turn: 'buyer' | 'seller'; message: string | null;
    profiles: { display_name: string | null; email: string; avatar_url: string | null } | null;
    offer_events: { id: string; actor_id: string; event_type: 'offer' | 'counter' | 'accepted' | 'declined'; amount: number | null; message: string | null; created_at: string }[]
  }[] = []
  if (isSeller) {
    const { data } = await supabase
      .from('offers')
      .select('id, buyer_id, amount, offer_type, status, current_turn, message, profiles(display_name, email, avatar_url), offer_events(id, actor_id, event_type, amount, message, created_at)')
      .eq('listing_id', id)
      .in('status', ['pending', 'countered'])
      .order('created_at', { ascending: false })
    sellerOffers = (data ?? []) as unknown as typeof sellerOffers
  }

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
              <div className="flex items-center gap-1 shrink-0">
                {(listing.status === 'claimed' || listing.status === 'sold') && (
                  <Badge variant="secondary">
                    {listing.status === 'sold' ? 'Sold' : 'Pending sale'}
                  </Badge>
                )}
                {!isSeller && (
                  user
                    ? <SaveButton authenticated listingId={id} initialSaved={isSaved} />
                    : <SaveButton authenticated={false} loginHref={`/auth/login?redirectTo=/listings/${id}&hint=save`} />
                )}
              </div>
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
              <div>
                {!user ? (
                  <div className="pt-4 border-t">
                    <Link
                      href={`/auth/login?redirectTo=/listings/${id}`}
                      className={cn(buttonVariants(), 'w-full justify-center')}
                    >
                      Sign in to make an offer
                    </Link>
                  </div>
                ) : (
                  <OfferSection
                    listing={{ id: listing.id, price: listing.price, is_free: listing.is_free }}
                    existingOffer={buyerOffer}
                    events={buyerOfferEvents}
                    userId={user.id}
                    sellerProfile={listing.profiles as { display_name: string | null; email: string; avatar_url: string | null; phone: string | null }}
                  />
                )}
              </div>
            )}

            {!isSeller && listing.status === 'claimed' && !buyerOffer && (
              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  This listing has a pending sale.{user && isSaved ? " You'll be notified if it gets relisted." : user ? ' Save it to get notified if it falls through and gets relisted.' : ''}
                </p>
              </div>
            )}

            {!isSeller && buyerOffer && listing.status !== 'active' && (
              <OfferSection
                listing={{ id: listing.id, price: listing.price, is_free: listing.is_free }}
                existingOffer={buyerOffer}
                events={buyerOfferEvents}
                userId={user!.id}
                sellerProfile={listing.profiles as { display_name: string | null; email: string; avatar_url: string | null; phone: string | null }}
              />
            )}

            {isSeller && (
              <div className="pt-2 space-y-4">
                <OffersPanel offers={sellerOffers} isFree={listing.is_free} />
                {listing.status === 'claimed' && (
                  <div className="flex flex-wrap gap-3 items-center">
                    <RelistButton id={id} />
                    <MarkSoldButton id={id} />
                  </div>
                )}
                {listing.status === 'active' && (
                  <div className="flex flex-wrap gap-3 items-center">
                    <Link
                      href={`/listings/${id}/edit`}
                      className={buttonVariants({ variant: 'outline' })}
                    >
                      Edit listing
                    </Link>
                    <DeleteButton id={id} />
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
