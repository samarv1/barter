'use client'

import { useActionState } from 'react'
import { updateProfile } from '@/actions/profile'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function ProfileForm({
  defaultDisplayName,
  defaultPhone,
}: {
  defaultDisplayName: string
  defaultPhone: string
}) {
  const [state, action, pending] = useActionState(updateProfile, 'idle')

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="display_name">Display name</Label>
        <Input
          id="display_name"
          name="display_name"
          type="text"
          defaultValue={defaultDisplayName}
          placeholder="Your name"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="phone">Phone number</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={defaultPhone}
          placeholder="(530) 555-0100"
        />
        <p className="text-xs text-muted-foreground">
          Shared with buyers only after an offer is accepted.
        </p>
      </div>

      {state !== null && state !== 'idle' && (
        <Alert variant="destructive">
          <AlertDescription>{state}</AlertDescription>
        </Alert>
      )}

      {state === null && (
        <p className="text-sm text-green-600">Profile saved.</p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  )
}
