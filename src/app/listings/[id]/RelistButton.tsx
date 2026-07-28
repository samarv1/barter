'use client'

import { useState, useTransition } from 'react'
import { relistFromAccepted } from '@/actions/listings'
import { Button } from '@/components/ui/button'

export default function RelistButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Re-list this item and cancel the claim?</span>
        <Button
          variant="destructive"
          size="sm"
          disabled={isPending}
          onClick={() => startTransition(() => relistFromAccepted(id))}
        >
          {isPending ? 'Re-listing…' : 'Yes, re-list'}
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
    <Button variant="outline" onClick={() => setConfirming(true)}>
      Re-list item
    </Button>
  )
}
