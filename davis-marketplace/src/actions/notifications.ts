'use server'
import { createClient } from '@/lib/supabase/server'

export async function getUnreadStatus(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data, error } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', user.id)
    .eq('read', false)
    .limit(1)

  if (error) console.error('[notifications] getUnreadStatus error:', error)
  return (data?.length ?? 0) > 0
}
