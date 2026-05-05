'use client'

import { useState, useTransition } from 'react'
import { Bookmark } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { toggleSaveListing } from '@/actions/saves'
import Link from 'next/link'

type Props =
  | { authenticated: false; loginHref: string }
  | { authenticated: true; listingId: string; initialSaved: boolean }

export default function SaveButton(props: Props) {
  const [saved, setSaved] = useState(props.authenticated ? props.initialSaved : false)
  const [pending, startTransition] = useTransition()

  if (!props.authenticated) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Save listing">
            <Bookmark />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 text-sm" align="end">
          <p className="mb-2">Sign in to save listings and get notified when they&apos;re relisted.</p>
          <Link href={props.loginHref} className="text-primary hover:underline font-medium">
            Sign in or create an account →
          </Link>
        </PopoverContent>
      </Popover>
    )
  }

  const listingId = props.authenticated ? props.listingId : null

  function handleClick() {
    if (!listingId) return
    const next = !saved
    setSaved(next)
    startTransition(async () => {
      await toggleSaveListing(listingId, saved)
    })
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleClick}
      disabled={pending}
      aria-label={saved ? 'Unsave listing' : 'Save listing'}
    >
      <Bookmark className={saved ? 'fill-current' : ''} />
    </Button>
  )
}
