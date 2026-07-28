'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getPublicUrl } from '@/lib/s3'
import { markAsSold, relistFromAccepted, deleteMyListing, completeSale } from '@/actions/listings'

type Listing = {
  id: string
  title: string
  price: number | null
  is_free: boolean
  category: string
  photo_keys: string[]
  status: string
}

type OfferSummary = { count: number; yourTurn: boolean }

interface Props {
  listing: Listing
  offerSummary?: OfferSummary
}

function formatPrice(price: number | null, isFree: boolean) {
  if (isFree || price === null) return 'Free'
  return `$${Number(price).toFixed(0)}`
}

type ConfirmAction = 'sold' | 'relist' | 'delete' | 'confirm' | null

export default function MyListingCard({ listing, offerSummary }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState<ConfirmAction>(null)
  const [error, setError] = useState<string | null>(null)

  const isActive = listing.status === 'active'
  const isClaimed = listing.status === 'claimed'

  function run(fn: () => Promise<void>) {
    setError(null)
    startTransition(async () => {
      try {
        await fn()
        setConfirming(null)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong')
      }
    })
  }

  return (
    <Card className="p-0 gap-0 flex flex-col">
      {/* Photo */}
      <Link href={`/listings/${listing.id}`}>
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
      </Link>

      <CardContent className="p-3 flex flex-col gap-2 flex-1">
        {/* Info */}
        <div className="space-y-0.5">
          <p className="text-sm font-medium truncate">{listing.title}</p>
          <p className="text-sm font-bold">{formatPrice(listing.price, listing.is_free)}</p>
          <p className="text-xs text-muted-foreground capitalize">{listing.category}</p>
        </div>

        {/* Offer badges */}
        {offerSummary && offerSummary.count > 0 && (
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
              {offerSummary.count} offer{offerSummary.count !== 1 ? 's' : ''}
            </Badge>
            {offerSummary.yourTurn && (
              <Badge className="text-[10px] px-1.5 py-0 h-4 bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-100">
                Your turn
              </Badge>
            )}
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        {/* Actions */}
        {confirming === null ? (
          <div className="flex flex-wrap gap-1 mt-auto pt-1">
            {isActive && (
              <>
                <Button asChild size="sm" variant="outline" className="text-xs h-7 px-2">
                  <Link href={`/listings/${listing.id}/edit`}>Edit</Link>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-7 px-2"
                  disabled={isPending}
                  onClick={() => setConfirming('sold')}
                >
                  Mark sold
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs h-7 px-2 text-destructive hover:text-destructive"
                  disabled={isPending}
                  onClick={() => setConfirming('delete')}
                >
                  Delete
                </Button>
              </>
            )}
            {isClaimed && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-7 px-2"
                  disabled={isPending}
                  onClick={() => setConfirming('confirm')}
                >
                  Confirm pickup
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs h-7 px-2 text-muted-foreground"
                  disabled={isPending}
                  onClick={() => setConfirming('relist')}
                >
                  Re-list
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1 mt-auto pt-1 flex-wrap">
            <span className="text-xs text-muted-foreground">
              {confirming === 'sold' && 'Mark as sold?'}
              {confirming === 'relist' && 'Re-activate this listing?'}
              {confirming === 'delete' && 'Delete permanently?'}
              {confirming === 'confirm' && 'Confirm pickup happened?'}
            </span>
            <Button
              size="sm"
              variant={confirming === 'delete' ? 'destructive' : 'default'}
              className="text-xs h-7 px-2"
              disabled={isPending}
              onClick={() => {
                if (confirming === 'sold') run(() => markAsSold(listing.id))
                else if (confirming === 'relist') run(() => relistFromAccepted(listing.id))
                else if (confirming === 'delete') run(() => deleteMyListing(listing.id))
                else if (confirming === 'confirm') run(() => completeSale(listing.id))
              }}
            >
              Confirm
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-xs h-7 px-2"
              disabled={isPending}
              onClick={() => setConfirming(null)}
            >
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
