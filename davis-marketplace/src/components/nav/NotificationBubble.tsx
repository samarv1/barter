'use client'
import { useState, useEffect } from 'react'
import { getUnreadStatus } from '@/actions/notifications'

export default function NotificationBubble({
  initialUnread,
  userId,
}: {
  initialUnread: boolean
  userId: string
}) {
  const [hasUnread, setHasUnread] = useState(initialUnread)

  useEffect(() => {
    getUnreadStatus().then(setHasUnread)

    const interval = setInterval(() => getUnreadStatus().then(setHasUnread), 30_000)
    const onFocus = () => getUnreadStatus().then(setHasUnread)
    window.addEventListener('focus', onFocus)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [userId])

  if (!hasUnread) return null
  return <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
}
