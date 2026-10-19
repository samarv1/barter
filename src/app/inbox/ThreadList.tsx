'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CircleUser, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { getPublicUrl } from '@/lib/s3'
import { respondToOffer } from '@/actions/offers'
import { markAsSold, relistFromAccepted, completeSale } from '@/actions/listings'
import type { Thread, OfferEvent } from './page'

const EVENT_LABELS: Record<string, string> = {
  offer: 'Offer',
  counter: 'Counter',
  accepted: 'Accepted',
  declined: 'Declined',
}

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Pending', variant: 'outline' },
  countered: { label: 'Counter-offer', variant: 'secondary' },
  accepted: { label: 'Accepted', variant: 'default' },
  declined: { label: 'Declined', variant: 'destructive' },
}

function EventTimeline({
  events,
  userId,
  otherName,
  selectable,
  onLatestSelected,
}: {
  events: OfferEvent[]
  userId: string
  otherName: string
  selectable: boolean
  onLatestSelected: (selected: boolean) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const sorted = [...events].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  const latestId = sorted[sorted.length - 1]?.id

  function handleSelect(id: string) {
    const next = selectedId === id ? null : id
    setSelectedId(next)
    onLatestSelected(next === latestId)
  }

  return (
    <div className="flex flex-row gap-2 py-1 overflow-x-auto">
      {sorted.map(ev => {
        const isMe = ev.actor_id === userId
        const isLatest = ev.id === latestId
        const isSelected = ev.id === selectedId
        return (
          <button
            key={ev.id}
            onClick={selectable ? () => handleSelect(ev.id) : undefined}
            disabled={!selectable}
            className={`w-52 shrink-0 text-left rounded-lg border px-3 py-2.5 transition-colors
              ${selectable
                ? isSelected ? 'border-foreground bg-background shadow-sm' : 'bg-muted/50 hover:bg-muted'
                : 'bg-muted/50 cursor-default'}`}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-semibold truncate">{isMe ? 'You' : otherName}</span>
              <span className={`text-[10px] shrink-0 ${isLatest ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                {isLatest ? 'Current' : EVENT_LABELS[ev.event_type]}
              </span>
            </div>
            {ev.amount !== null && (
              <p className="font-bold text-base">${Number(ev.amount).toFixed(0)}</p>
            )}
            {ev.message && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">&ldquo;{ev.message}&rdquo;</p>
            )}
            <p className="text-[10px] text-muted-foreground mt-1">
              {new Date(ev.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </button>
        )
      })}
    </div>
  )
}

function ThreadCard({ thread, userId }: { thread: Thread; userId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [expanded, setExpanded] = useState(false)
  const [showCounter, setShowCounter] = useState(false)
  const [counterAmount, setCounterAmount] = useState('')
  const [counterMessage, setCounterMessage] = useState('')
  const [markingAsSold, setMarkingAsSold] = useState(false)
  const [relisting, setRelisting] = useState(false)
  const [markingComplete, setMarkingComplete] = useState(false)
  const [respondMode, setRespondMode] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const listing = thread.listings
  const isSeller = userId === listing.seller_id
  const isMyTurn = (isSeller && thread.current_turn === 'seller') || (!isSeller && thread.current_turn === 'buyer')
  const isActive = thread.status !== 'declined' && thread.status !== 'accepted'
  const badge = STATUS_BADGE[thread.status]

  const otherParty = isSeller
    ? thread.profiles
    : listing.profiles as typeof thread.profiles
  const thumb = listing.photo_keys?.[0]

  function run(fn: () => Promise<void>) {
    setError(null)
    startTransition(async () => {
      try {
        await fn()
        router.refresh()
        setShowCounter(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong')
      }
    })
  }

  return (
    <div className={`border rounded-lg overflow-hidden transition-opacity ${!isActive ? 'opacity-60' : ''}`}>
      {/* Thread header — always visible */}
      <button
        className="w-full text-left p-4 flex items-center gap-3 hover:bg-muted/40 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        {/* Listing thumbnail */}
        <div className="h-12 w-12 rounded-md bg-muted overflow-hidden shrink-0">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={getPublicUrl(thumb)} alt={listing.title} className="h-full w-full object-cover" />
          ) : null}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium truncate">{listing.title}</p>
            <Badge variant={badge.variant} className="text-[10px] px-1.5 py-0 h-4 shrink-0">{badge.label}</Badge>
            {isActive && isMyTurn && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0 bg-amber-100 text-amber-800 border-amber-200">Your turn</Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {otherParty?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={otherParty.avatar_url} alt="" className="h-4 w-4 rounded-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <CircleUser className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-xs text-muted-foreground truncate">
              {otherParty?.display_name || otherParty?.email || (isSeller ? 'A buyer' : 'Seller')}
              {' · '}
              <span className="font-medium text-foreground">${Number(thread.amount).toFixed(0)}</span>
            </span>
          </div>
        </div>

        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t px-4 pb-4 space-y-3">
          <EventTimeline
            events={thread.offer_events}
            userId={userId}
            otherName={otherParty?.display_name || otherParty?.email?.split('@')[0] || (isSeller ? 'Buyer' : 'Seller')}
            selectable={thread.offer_events.length > 1}
            onLatestSelected={setRespondMode}
          />

          {thread.status === 'accepted' && (
            <>
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 space-y-0.5">
                <p className="text-sm font-semibold text-green-800">
                  {listing.status === 'sold' ? 'Sold — pickup complete' : 'Accepted — arrange pickup'}
                </p>
                {otherParty && (
                  <>
                    {otherParty.display_name && (
                      <p className="text-sm text-green-700">{otherParty.display_name}</p>
                    )}
                    <a href={`mailto:${otherParty.email}`} className="text-sm text-green-700 underline block">
                      {otherParty.email}
                    </a>
                    {otherParty.phone && (
                      <p className="text-sm text-green-700">{otherParty.phone}</p>
                    )}
                  </>
                )}
              </div>

              {isSeller && listing.status === 'claimed' && (
                <div className="pt-1 border-t space-y-2">
                  {!relisting && !markingComplete && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setRelisting(true)}>
                        Re-list item
                      </Button>
                      <Button size="sm" onClick={() => setMarkingComplete(true)}>
                        Confirm pickup
                      </Button>
                    </div>
                  )}
                  {relisting && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs text-muted-foreground">Re-list this item and cancel the claim?</p>
                      <Button size="sm" variant="destructive" disabled={isPending} onClick={() => run(() => relistFromAccepted(listing.id))}>
                        Yes, re-list
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRelisting(false)}>Cancel</Button>
                    </div>
                  )}
                  {markingComplete && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs text-muted-foreground">Confirm that pickup happened and the sale is complete?</p>
                      <Button size="sm" disabled={isPending} onClick={() => run(() => completeSale(listing.id))}>
                        Yes, confirm
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setMarkingComplete(false)}>Cancel</Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Buyer/seller actions — shown immediately if single event, or when current card is selected */}
          {isActive && isMyTurn && (respondMode || thread.offer_events.length <= 1) && !showCounter && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={isPending}
                onClick={() => run(() => respondToOffer(thread.id, 'accept'))}
              >
                Accept ${Number(thread.amount).toFixed(0)}
              </Button>
              {thread.offer_type !== 'claim' && (
                <Button size="sm" variant="outline" disabled={isPending} onClick={() => setShowCounter(true)}>
                  Counter
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={isPending}
                onClick={() => run(() => respondToOffer(thread.id, 'decline'))}
              >
                Decline
              </Button>
            </div>
          )}

          {isActive && isMyTurn && (respondMode || thread.offer_events.length <= 1) && showCounter && thread.offer_type !== 'claim' && (
            <div className="space-y-2">
              <div className="relative w-36">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input type="number" min="0" step="0.01" placeholder="0.00" className="pl-6" value={counterAmount} onChange={e => setCounterAmount(e.target.value)} />
              </div>
              <Textarea placeholder="Add a note (optional)" rows={2} value={counterMessage} onChange={e => setCounterMessage(e.target.value)} />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={isPending || !counterAmount}
                  onClick={() => run(() => respondToOffer(thread.id, 'counter', Number(counterAmount), counterMessage || undefined))}
                >
                  Send Counter
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowCounter(false)}>Cancel</Button>
              </div>
            </div>
          )}


          {isActive && isMyTurn && !respondMode && thread.offer_events.length > 1 && !showCounter && (
            <p className="text-xs text-muted-foreground">Select the current offer above to respond.</p>
          )}

          {isActive && !isMyTurn && (
            <p className="text-xs text-muted-foreground italic">Waiting for the other party to respond…</p>
          )}

          {/* Seller: mark as sold (closes listing, declines all other open offers) */}
          {isSeller && listing.status === 'active' && (
            <div className="pt-1 border-t flex items-center gap-3">
              {!markingAsSold ? (
                <button
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                  onClick={() => setMarkingAsSold(true)}
                >
                  Close listing
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">This will remove your listing and decline all open offers. Do this if you&apos;ve sold it elsewhere.</p>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={isPending}
                    onClick={() => run(() => markAsSold(listing.id))}
                  >
                    Yes, close listing
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setMarkingAsSold(false)}>Cancel</Button>
                </div>
              )}
            </div>
          )}

          {thread.status !== 'accepted' && (
            <Link href={`/listings/${listing.id}`} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 block">
              View listing →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

export default function ThreadList({ threads, userId }: { threads: Thread[]; userId: string }) {
  const active        = threads.filter(t => t.status === 'pending' || t.status === 'countered')
  const pendingPickup = threads.filter(t => t.status === 'accepted' && t.listings?.status === 'claimed')
  const soldThreads   = threads.filter(t => t.status === 'accepted' && t.listings?.status === 'sold')
  const closed        = threads.filter(t => t.status === 'declined')

  if (threads.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground space-y-3">
        <p>No offers yet.</p>
        <div className="flex flex-col gap-1.5 items-center text-sm">
          <Link href="/" className="text-primary hover:underline">Browse listings to make an offer →</Link>
          <Link href="/listings/new" className="text-primary hover:underline">Post a listing to receive offers →</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {active.length > 0 && (
        <section className="space-y-2">
          {active.map(t => <ThreadCard key={t.id} thread={t} userId={userId} />)}
        </section>
      )}

      {pendingPickup.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Pending pickup</p>
          {pendingPickup.map(t => <ThreadCard key={t.id} thread={t} userId={userId} />)}
        </section>
      )}

      {soldThreads.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Sold</p>
          {soldThreads.map(t => <ThreadCard key={t.id} thread={t} userId={userId} />)}
        </section>
      )}

      {closed.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Closed</p>
          {closed.map(t => <ThreadCard key={t.id} thread={t} userId={userId} />)}
        </section>
      )}
    </div>
  )
}
