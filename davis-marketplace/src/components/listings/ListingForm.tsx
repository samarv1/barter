'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PhotoUploader from './PhotoUploader'

const CATEGORIES = [
  { value: 'furniture', label: 'Furniture' },
  { value: 'electronics', label: 'Electronics' },
  { value: 'clothing', label: 'Clothing' },
  { value: 'books', label: 'Books' },
  { value: 'appliances', label: 'Appliances' },
  { value: 'bikes', label: 'Bikes' },
  { value: 'sports', label: 'Sports' },
  { value: 'other', label: 'Other' },
]

const AVAILABILITY = [
  { value: 'asap', label: 'ASAP — available now' },
  { value: 'beginning_of_summer', label: 'Beginning of summer (early June)' },
  { value: 'end_of_summer', label: 'End of summer (late August)' },
]

export default function ListingForm() {
  const router = useRouter()
  const [photoKeys, setPhotoKeys] = useState<string[]>([])
  const [isFree, setIsFree] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (photoKeys.length === 0) {
      setError('Please upload at least one photo.')
      return
    }

    setSubmitting(true)
    setError(null)

    const form = new FormData(e.currentTarget)
    const body = {
      title: form.get('title'),
      description: form.get('description'),
      price: isFree ? null : Number(form.get('price')),
      is_free: isFree,
      category: form.get('category'),
      availability: form.get('availability'),
      photo_keys: photoKeys,
    }

    const res = await fetch('/api/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Something went wrong.')
      setSubmitting(false)
      return
    }

    router.push(`/listings/${data.id}`)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Photos <span className="text-red-500">*</span>
        </label>
        <PhotoUploader onChange={setPhotoKeys} />
      </div>

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={100}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="e.g. IKEA MALM Desk, barely used"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Condition, dimensions, any flaws, etc."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Price</label>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isFree}
              onChange={e => setIsFree(e.target.checked)}
              className="rounded border-gray-300"
            />
            Free
          </label>
          {!isFree && (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
              <input
                name="price"
                type="number"
                min="0"
                step="0.01"
                required={!isFree}
                className="pl-7 block w-36 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="category" className="block text-sm font-medium text-gray-700">
          Category <span className="text-red-500">*</span>
        </label>
        <select
          id="category"
          name="category"
          required
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Select a category</option>
          {CATEGORIES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="availability" className="block text-sm font-medium text-gray-700">
          Pickup availability <span className="text-red-500">*</span>
        </label>
        <select
          id="availability"
          name="availability"
          required
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Select availability</option>
          {AVAILABILITY.map(a => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? 'Posting…' : 'Post listing'}
      </button>
    </form>
  )
}
