'use client'

import { useActionState } from 'react'
import { updateProfile } from '@/actions/profile'

export default function ProfileForm({
  defaultDisplayName,
  defaultPhone,
}: {
  defaultDisplayName: string
  defaultPhone: string
}) {
  const [error, action, pending] = useActionState(updateProfile, null)

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="display_name" className="block text-sm font-medium text-gray-700">
          Display name
        </label>
        <input
          id="display_name"
          name="display_name"
          type="text"
          defaultValue={defaultDisplayName}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Your name"
        />
      </div>

      <div>
        <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
          Phone number
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={defaultPhone}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="(530) 555-0100"
        />
        <p className="mt-1 text-xs text-gray-500">
          Shared with buyers only after an offer is accepted.
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      {error === null && (
        <p className="text-sm text-green-600">Profile saved.</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  )
}
