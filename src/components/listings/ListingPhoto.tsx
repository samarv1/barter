'use client'

import { useState } from 'react'
import { ImageIcon } from 'lucide-react'

export default function ListingPhoto({
  src,
  alt,
  className,
}: {
  src?: string
  alt: string
  className: string
}) {
  const [failedSrc, setFailedSrc] = useState<string>()

  return (
    <div className={`overflow-hidden bg-muted ${className}`}>
      {src && src !== failedSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <div className="flex h-full min-h-40 items-center justify-center text-muted-foreground">
          <ImageIcon className="h-8 w-8 opacity-50" aria-hidden="true" />
        </div>
      )}
    </div>
  )
}
