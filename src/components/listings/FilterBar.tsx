'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const CATEGORIES = [
  { value: '_all', label: 'All categories' },
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
  { value: '_all', label: 'Any time' },
  { value: 'asap', label: 'ASAP' },
  { value: 'beginning_of_summer', label: 'Beginning of summer' },
  { value: 'end_of_summer', label: 'End of summer' },
]

interface Props {
  initialCategory?: string
  initialAvailability?: string
}

export default function FilterBar({ initialCategory = '', initialAvailability = '' }: Props) {
  const router = useRouter()
  const [category, setCategory] = useState(initialCategory || '_all')
  const [availability, setAvailability] = useState(initialAvailability || '_all')

  function buildUrl(overrides: { category?: string; availability?: string }) {
    const params = new URLSearchParams()
    const catVal = overrides.category ?? category
    const avaVal = overrides.availability ?? availability
    if (catVal && catVal !== '_all') params.set('category', catVal)
    if (avaVal && avaVal !== '_all') params.set('availability', avaVal)
    const qs = params.toString()
    return qs ? `/?${qs}` : '/'
  }

  function handleCategoryChange(val: string) {
    setCategory(val)
    router.push(buildUrl({ category: val }))
  }

  function handleAvailabilityChange(val: string) {
    setAvailability(val)
    router.push(buildUrl({ availability: val }))
  }

  function handleClear() {
    setCategory('_all')
    setAvailability('_all')
    router.push('/')
  }

  const hasFilters = (category && category !== '_all') || (availability && availability !== '_all')

  return (
    <div className="flex flex-wrap gap-3">
      <Select value={category} onValueChange={handleCategoryChange}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="All categories" />
        </SelectTrigger>
        <SelectContent>
          {CATEGORIES.map(c => (
            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={availability} onValueChange={handleAvailabilityChange}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Any time" />
        </SelectTrigger>
        <SelectContent>
          {AVAILABILITY.map(a => (
            <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hasFilters && (
        <Button variant="outline" onClick={handleClear}>Clear</Button>
      )}
    </div>
  )
}
