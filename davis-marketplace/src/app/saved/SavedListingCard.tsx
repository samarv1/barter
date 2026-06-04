'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Bookmark } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getPublicUrl } from '@/lib/s3'
import { toggleSaveListing } from '@/actions/saves'

type Listing = {
  id: string
  title: string
  price: number | null
  is_free: boolean
  category: string
  photo_keys: string[]
  status: string
}

function formatPrice(price: number | null, isFree: boolean) {
  if (isFree || price === null) return 'Free'
  return `$${Number(price).toFixed(0)}`
}

export default function SavedListingCard({ listing }: { listing: Listing }) {
  const [removed, setRemoved] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleUnsave() {
    startTransition(async () => {
      await toggleSaveListing(listing.id, true)
      setRemoved(true)
    })
  }

  if (removed) return null

  const isClaimed = listing.status === 'claimed'
  const isSold = listing.status === 'sold'

  return (
    <Card className="p-0 gap-0 flex flex-col">
      <Link href={`/listings/${listing.id}`}>
        <div className={`aspect-square bg-muted overflow-hidden rounded-t-xl ${isClaimed || isSold ? 'opacity-60' : ''}`}>
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
        <div className="space-y-0.5">
          <p className="text-sm font-medium truncate">{listing.title}</p>
          <p className="text-sm font-bold">{formatPrice(listing.price, listing.is_free)}</p>
          <p className="text-xs text-muted-foreground capitalize">{listing.category}</p>
        </div>

        {(isClaimed || isSold) && (
          <Badge variant="secondary" className="w-fit text-[10px] px-1.5 py-0 h-4">
            {isSold ? 'Sold' : 'Pending sale'}
          </Badge>
        )}

        <div className="mt-auto pt-1">
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-7 px-2 text-muted-foreground w-full justify-start gap-1"
            disabled={pending}
            onClick={handleUnsave}
          >
            <Bookmark className="h-3 w-3 fill-current" />
            Unsave
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
