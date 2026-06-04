'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function MarkNotificationsRead({ userId }: { userId: string }) {
  const router = useRouter()

  useEffect(() => {
    createClient()
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false)
      .then(({ error }) => {
        if (!error) router.refresh()
      })
  }, [userId, router])

  return null
}
