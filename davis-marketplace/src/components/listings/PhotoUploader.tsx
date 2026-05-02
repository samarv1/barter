'use client'

import { useState, useRef } from 'react'
import { getPublicUrl } from '@/lib/s3'
import { Button } from '@/components/ui/button'

interface UploadedPhoto {
  key: string
  previewUrl: string
}

interface Props {
  onChange: (keys: string[]) => void
}

async function normalizeFile(file: File): Promise<File> {
  const isHeic =
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    file.name.toLowerCase().endsWith('.heic') ||
    file.name.toLowerCase().endsWith('.heif')

  if (!isHeic) return file

  const heic2any = (await import('heic2any')).default
  const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 })
  const converted = Array.isArray(blob) ? blob[0] : blob
  const newName = file.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg')
  return new File([converted], newName, { type: 'image/jpeg' })
}

export default function PhotoUploader({ onChange }: Props) {
  const [photos, setPhotos] = useState<UploadedPhoto[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList) {
    setError(null)
    setUploading(true)
    try {
      const normalized = await Promise.all(Array.from(files).map(normalizeFile))
      const payload = normalized.map(f => ({ filename: f.name, contentType: f.type }))
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to get upload URLs')
      const results: { url: string; key: string }[] = await res.json()

      const uploadResponses = await Promise.all(
        results.map(({ url }, i) =>
          fetch(url, { method: 'PUT', body: normalized[i], headers: { 'Content-Type': normalized[i].type } })
        )
      )
      const failed = uploadResponses.find(r => !r.ok)
      if (failed) throw new Error(`S3 upload failed: ${failed.status}`)

      const newPhotos = results.map(({ key }, i) => ({
        key,
        previewUrl: URL.createObjectURL(normalized[i]),
      }))

      const updated = [...photos, ...newPhotos]
      setPhotos(updated)
      onChange(updated.map(p => p.key))
    } catch {
      setError('Upload failed — please try again.')
    } finally {
      setUploading(false)
    }
  }

  function remove(key: string) {
    const updated = photos.filter(p => p.key !== key)
    setPhotos(updated)
    onChange(updated.map(p => p.key))
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {photos.map(photo => (
          <div key={photo.key} className="relative w-24 h-24 rounded-md overflow-hidden border border-gray-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.previewUrl} alt="" className="w-full h-full object-cover" />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => remove(photo.key)}
              className="absolute top-0.5 right-0.5 h-5 w-5 bg-black/60 text-white hover:bg-black/80 hover:text-white rounded-full"
            >
              ×
            </Button>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-24 h-24 rounded-md border-dashed flex flex-col items-center justify-center text-xs gap-1"
        >
          {uploading ? (
            <span>Uploading…</span>
          ) : (
            <>
              <span className="text-2xl leading-none">+</span>
              <span>Add photo</span>
            </>
          )}
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {photos.length === 0 && !error && (
        <p className="text-xs text-gray-500">At least one photo is required.</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
        multiple
        className="hidden"
        onChange={e => e.target.files && handleFiles(e.target.files)}
      />
    </div>
  )
}
