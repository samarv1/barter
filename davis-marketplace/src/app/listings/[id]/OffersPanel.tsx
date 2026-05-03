'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { CircleUser } from 'lucide-react'
import { respondToOffer } from '@/actions/offers'

type OfferEvent = {
  id: string
  actor_id: string
  event_type: 'offer' | 'counter' | 'accepted' | 'declined'
  amount: number | null
  message: string | null
  created_at: string
}

type SellerOffer = {
  id: string
  buyer_id: string
  amount: number
  offer_type: 'claim' | 'negotiation'
  status: 'pending' | 'countered'
  current_turn: 'buyer' | 'seller'
  message: string | null
  profiles: { display_name: string | null; email: string; avatar_url: string | null } | null
  offer_events: OfferEvent[]
}

interface Props {
  offers: SellerOffer[]
  isFree: boolean
}

const EVENT_LABELS: Record<string, string> = {
  offer: 'Offer',
  counter: 'Counter',
  accepted: 'Accepted',
  declined: 'Declined',
}

function OfferCard({ offer, isFree }: { offer: SellerOffer; isFree: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showHistory, setShowHistory] = useState(false)
  const [showCounter, setShowCounter] = useState(false)
  const [counterAmount, setCounterAmount] = useState('')
  const [counterMessage, setCounterMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  const buyer = offer.profiles
  const sortedEvents = [...offer.offer_events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
  const isMyTurn = offer.current_turn === 'seller'

  function run(fn: () => Promise<void>) {
    setError(null)
    startTransition(async () => {
      try {
        await fn()
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong')
      }
    })
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      {/* Buyer info */}
      <div className="flex items-center gap-2">
        {buyer?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={buyer.avatar_url} alt={buyer.display_name ?? 'Buyer'} className="h-7 w-7 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
        ) : (
          <CircleUser className="h-7 w-7 text-muted-foreground shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{buyer?.display_name || 'A Davis student'}</p>
          <p className="text-xs text-muted-foreground truncate">{buyer?.email}</p>
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <span className="text-sm font-bold">${Number(offer.amount).toFixed(2)}</span>
          {offer.offer_type === 'claim' && (
            <Badge variant="outline" className="text-xs">Full price</Badge>
          )}
          {!isMyTurn && (
            <Badge variant="outline" className="text-xs">Awaiting buyer</Badge>
          )}
        </div>
      </div>

      {offer.message && (
        <p className="text-sm text-muted-foreground italic">&ldquo;{offer.message}&rdquo;</p>
      )}

      {/* History toggle */}
      {sortedEvents.length > 0 && (
        <div>
          <button
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            onClick={() => setShowHistory(v => !v)}
          >
            {showHistory ? 'Hide history' : `Show history (${sortedEvents.length} event${sortedEvents.length !== 1 ? 's' : ''})`}
          </button>
          {showHistory && (
            <div className="mt-2 space-y-1.5 pl-2 border-l">
              {sortedEvents.map(ev => (
                <div key={ev.id} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{EVENT_LABELS[ev.event_type]}</span>
                  {ev.amount !== null && <span> · ${Number(ev.amount).toFixed(2)}</span>}
                  {ev.message && <span> · &ldquo;{ev.message}&rdquo;</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Actions — only shown when it's seller's turn */}
      {isMyTurn && !showCounter && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => run(() => respondToOffer(offer.id, 'accept'))}
          >
            Accept ${Number(offer.amount).toFixed(2)}
          </Button>
          {!isFree && offer.offer_type !== 'claim' && (
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => setShowCounter(true)}
            >
              Counter
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => run(() => respondToOffer(offer.id, 'decline'))}
          >
            Decline
          </Button>
        </div>
      )}

      {isMyTurn && showCounter && (
        <div className="space-y-2">
          <div className="relative w-36">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              className="pl-6"
              value={counterAmount}
              onChange={e => setCounterAmount(e.target.value)}
            />
          </div>
          <Textarea
            placeholder="Add a note (optional)"
            rows={2}
            value={counterMessage}
            onChange={e => setCounterMessage(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={isPending || !counterAmount}
              onClick={() => run(() => respondToOffer(offer.id, 'counter', Number(counterAmount), counterMessage || undefined))}
            >
              Send Counter
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowCounter(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function OffersPanel({ offers, isFree }: Props) {
  if (offers.length === 0) return null

  return (
    <div className="pt-2 space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Offers ({offers.length})
      </h2>
      {offers.map(offer => (
        <OfferCard key={offer.id} offer={offer} isFree={isFree} />
      ))}
    </div>
  )
}
