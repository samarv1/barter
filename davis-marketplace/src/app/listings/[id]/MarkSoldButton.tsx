'use client'

import { useState, useTransition } from 'react'
import { completeSale } from '@/actions/listings'
import { Button } from '@/components/ui/button'

export default function MarkSoldButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Mark pickup as complete?</span>
        <Button
          size="sm"
          disabled={isPending}
          onClick={() => startTransition(() => completeSale(id))}
        >
          {isPending ? 'Saving…' : 'Yes, confirm'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => setConfirming(false)}
        >
          Cancel
        </Button>
      </div>
    )
  }

  return (
    <Button onClick={() => setConfirming(true)}>
      Confirm pickup
    </Button>
  )
}
