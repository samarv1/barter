'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Bookmark } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toggleSaveListing } from '@/actions/saves'

type Props =
  | { authenticated: false; loginHref: string }
  | { authenticated: true; listingId: string; initialSaved: boolean }

export default function SaveButton(props: Props) {
  const [saved, setSaved] = useState(props.authenticated ? props.initialSaved : false)
  const [pending, startTransition] = useTransition()

  if (!props.authenticated) {
    return (
      <Button asChild variant="ghost" size="icon">
        <Link href={props.loginHref} aria-label="Sign in to save listing">
          <Bookmark />
        </Link>
      </Button>
    )
  }

  const { listingId } = props

  function handleClick() {
    setSaved(s => !s)
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
