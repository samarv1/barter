'use client'

import { useState, useTransition } from 'react'
import { deleteListing } from '@/actions/listings'
import { Button } from '@/components/ui/button'

export default function DeleteButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Delete this listing?</span>
        <Button
          variant="destructive"
          size="sm"
          disabled={isPending}
          onClick={() => startTransition(() => deleteListing(id))}
        >
          {isPending ? 'Deleting…' : 'Yes, delete'}
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
    <Button
      variant="outline"
      onClick={() => setConfirming(true)}
      className="text-destructive hover:text-destructive hover:border-destructive"
    >
      Delete listing
    </Button>
  )
}
