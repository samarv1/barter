'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PhotoUploader from './PhotoUploader'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'

const CATEGORIES = [
  { value: 'furniture', label: 'Furniture' },
  { value: 'electronics', label: 'Electronics' },
  { value: 'bikes', label: 'Bikes' },
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
  const [category, setCategory] = useState('')
  const [availability, setAvailability] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (photoKeys.length === 0) {
      setError('Please upload at least one photo.')
      return
    }
    if (!category) {
      setError('Please select a category.')
      return
    }
    if (!availability) {
      setError('Please select a pickup availability.')
      return
    }

    setSubmitting(true)
    setError(null)

    const form = new FormData(e.currentTarget)
    const priceVal = Number(form.get('price')) || 0
    const body = {
      title: form.get('title'),
      description: form.get('description'),
      price: priceVal === 0 ? null : priceVal,
      is_free: priceVal === 0,
      category,
      availability,
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
      <div className="space-y-2">
        <Label>
          Photos <span className="text-red-500">*</span>
        </Label>
        <PhotoUploader onChange={setPhotoKeys} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="title">
          Title <span className="text-red-500">*</span>
        </Label>
        <Input
          id="title"
          name="title"
          type="text"
          required
          maxLength={100}
          placeholder="e.g. IKEA MALM Desk, barely used"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={4}
          placeholder="Condition, dimensions, any flaws, etc."
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="price">Price</Label>
        <div className="relative w-36">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
          <Input
            id="price"
            name="price"
            type="number"
            min="0"
            step="0.01"
            className="pl-6"
            placeholder="0.00"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="category">
          Category <span className="text-red-500">*</span>
        </Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger id="category" className="w-full">
            <SelectValue placeholder="Select a category" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(c => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="availability">
          Pickup availability <span className="text-red-500">*</span>
        </Label>
        <Select value={availability} onValueChange={setAvailability}>
          <SelectTrigger id="availability" className="w-full">
            <SelectValue placeholder="Select availability" />
          </SelectTrigger>
          <SelectContent>
            {AVAILABILITY.map(a => (
              <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? 'Posting…' : 'Post listing'}
      </Button>
    </form>
  )
}
