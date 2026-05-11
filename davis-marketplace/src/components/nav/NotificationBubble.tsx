'use client'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

export default function NotificationBubble({
  initialUnread,
  userId,
}: {
  initialUnread: boolean
  userId: string
}) {
  const [hasUnread, setHasUnread] = useState(initialUnread)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('notification-badge')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => setHasUnread(true)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        async () => {
          const { data } = await supabase
            .from('notifications')
            .select('id')
            .eq('user_id', userId)
            .eq('read', false)
            .limit(1)
          setHasUnread((data?.length ?? 0) > 0)
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  if (!hasUnread) return null
  return <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
}
