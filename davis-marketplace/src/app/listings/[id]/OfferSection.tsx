'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { claimAtListedPrice, makeOffer, respondToOffer } from '@/actions/offers'

type Offer = {
  id: string
  amount: number
  offer_type: 'claim' | 'negotiation'
  status: 'pending' | 'accepted' | 'declined' | 'countered'
  current_turn: 'buyer' | 'seller'
  message: string | null
}

type OfferEvent = {
  id: string
  actor_id: string
  event_type: 'offer' | 'counter' | 'accepted' | 'declined'
  amount: number | null
  message: string | null
  created_at: string
}

type Listing = {
  id: string
  price: number | null
  is_free: boolean
}

type SellerProfile = {
  display_name: string | null
  email: string
  avatar_url: string | null
  phone: string | null
}

interface Props {
  listing: Listing
  existingOffer: Offer | null
  events: OfferEvent[]
  userId: string
  sellerProfile?: SellerProfile | null
}

const EVENT_LABELS: Record<string, string> = {
  offer: 'Offer sent',
  counter: 'Counter-offer',
  accepted: 'Accepted',
  declined: 'Declined',
}

function formatAmount(amount: number | null, isFree: boolean) {
  if (isFree || amount === null || amount === 0) return 'Free'
  return `$${Number(amount).toFixed(2)}`
}

function EventTimeline({ events, userId }: { events: OfferEvent[]; userId: string }) {
  if (events.length === 0) return null
  return (
    <div className="space-y-3 py-2">
      {events.map(ev => {
        const isMe = ev.actor_id === userId
        return (
          <div key={ev.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
            <div className={`flex-1 max-w-xs rounded-lg px-3 py-2 text-sm ${isMe ? 'bg-primary text-primary-foreground ml-auto' : 'bg-muted'}`}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-medium text-xs opacity-70">{isMe ? 'You' : 'Seller'}</span>
                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 leading-none">
                  {EVENT_LABELS[ev.event_type]}
                </Badge>
              </div>
              {ev.amount !== null && (
                <p className="font-bold">{formatAmount(ev.amount, false)}</p>
              )}
              {ev.message && <p className="text-xs opacity-80 mt-0.5">{ev.message}</p>}
              <p className="text-[10px] opacity-50 mt-1">
                {new Date(ev.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function OfferSection({ listing, existingOffer, events, userId, sellerProfile }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showOfferForm, setShowOfferForm] = useState(false)
  const [showCounterForm, setShowCounterForm] = useState(false)
  const [offerAmount, setOfferAmount] = useState('')
  const [offerMessage, setOfferMessage] = useState('')
  const [counterAmount, setCounterAmount] = useState('')
  const [counterMessage, setCounterMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

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

  // Accepted
  if (existingOffer?.status === 'accepted') {
    return (
      <div className="pt-4 border-t space-y-3">
        <EventTimeline events={events} userId={userId} />
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 space-y-0.5 text-sm text-green-800">
          <p className="font-semibold">Claimed — arrange pickup with the seller</p>
          {sellerProfile && (
            <>
              {sellerProfile.display_name && (
                <p>{sellerProfile.display_name}</p>
              )}
              <a href={`mailto:${sellerProfile.email}`} className="underline block">
                {sellerProfile.email}
              </a>
              {sellerProfile.phone && <p>{sellerProfile.phone}</p>}
            </>
          )}
        </div>
      </div>
    )
  }

  // Awaiting seller
  if (existingOffer && existingOffer.status !== 'declined' && existingOffer.current_turn === 'seller') {
    return (
      <div className="pt-2 border-t space-y-1">
        <EventTimeline events={events} userId={userId} />
        <p className="text-sm text-muted-foreground italic">
          {existingOffer.offer_type === 'claim' ? 'Awaiting seller confirmation…' : 'Awaiting seller response…'}
        </p>
      </div>
    )
  }

  // Counter received — buyer's turn
  if (existingOffer && existingOffer.status !== 'declined' && existingOffer.current_turn === 'buyer') {
    return (
      <div className="pt-4 border-t space-y-3">
        <EventTimeline events={events} userId={userId} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!showCounterForm ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={isPending}
              onClick={() => run(() => respondToOffer(existingOffer.id, 'accept'))}
            >
              Accept {formatAmount(existingOffer.amount, false)}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => setShowCounterForm(true)}
            >
              Counter
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => run(() => respondToOffer(existingOffer.id, 'decline'))}
            >
              Decline
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="relative w-32">
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
                onClick={() => run(() => respondToOffer(existingOffer.id, 'counter', Number(counterAmount), counterMessage || undefined))}
              >
                Send Counter
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowCounterForm(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // No offer yet, or re-offer after a decline
  return (
    <div className="pt-4 border-t space-y-3">
      {existingOffer?.status === 'declined' && (
        <>
          <EventTimeline events={events} userId={userId} />
          <p className="text-xs text-muted-foreground italic">
            {events.filter(e => e.event_type === 'declined').at(-1)?.actor_id === userId
              ? 'You declined — make a new offer below.'
              : 'The seller declined your offer — make a new one below.'}
          </p>
        </>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {listing.is_free ? (
        <Button
          className="w-full"
          disabled={isPending}
          onClick={() => run(() => claimAtListedPrice(listing.id))}
        >
          Claim for free
        </Button>
      ) : (
        <>
          <Button
            className="w-full"
            disabled={isPending}
            onClick={() => run(() => claimAtListedPrice(listing.id))}
          >
            Claim at {formatAmount(listing.price, false)}
          </Button>

          {!showOfferForm ? (
            <button
              className="w-full text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
              onClick={() => setShowOfferForm(true)}
            >
              Make a lower offer
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="relative w-32">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="pl-6"
                    value={offerAmount}
                    onChange={e => setOfferAmount(e.target.value)}
                  />
                </div>
              </div>
              <Textarea
                placeholder="Add a note (optional) — e.g. Can pick up Saturday"
                rows={2}
                value={offerMessage}
                onChange={e => setOfferMessage(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={isPending || !offerAmount}
                  onClick={() => run(() => makeOffer(listing.id, Number(offerAmount), offerMessage || undefined))}
                >
                  Send Offer
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowOfferForm(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
