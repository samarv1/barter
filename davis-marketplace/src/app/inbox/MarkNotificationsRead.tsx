'use client'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function MarkNotificationsRead({ userId }: { userId: string }) {
  useEffect(() => {
    createClient()
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false)
      .then(() => {})
  }, [userId])

  return null
}
