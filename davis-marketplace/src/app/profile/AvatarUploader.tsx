'use client'

import { useRef, useState } from 'react'
import { CircleUser, Camera, Loader2 } from 'lucide-react'
import { updateAvatar } from '@/actions/profile'

export default function AvatarUploader({ avatarUrl }: { avatarUrl?: string }) {
  const [current, setCurrent] = useState(avatarUrl)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setUploading(true)
    setCurrent(URL.createObjectURL(file))

    try {
      const res = await fetch('/api/upload?prefix=avatars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ filename: file.name, contentType: file.type }]),
      })
      if (!res.ok) throw new Error()

      const [{ url, key }]: { url: string; key: string }[] = await res.json()
      const put = await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      if (!put.ok) throw new Error()

      await updateAvatar(key)
    } catch {
      setError('Upload failed — try again.')
      setCurrent(avatarUrl)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="relative group rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
        aria-label="Change profile photo"
      >
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current}
            alt="Profile photo"
            className="h-20 w-20 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <CircleUser className="h-20 w-20 text-muted-foreground" />
        )}
        <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          {uploading
            ? <Loader2 className="h-5 w-5 text-white animate-spin" />
            : <Camera className="h-5 w-5 text-white" />
          }
        </div>
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />
    </div>
  )
}
