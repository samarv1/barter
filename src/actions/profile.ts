'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getPublicUrl } from '@/lib/s3'
import { isOwnedObjectKey } from '@/lib/validation'

export async function updateProfile(_prevState: string | null | undefined, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'Not authenticated'

  const display_name = formData.get('display_name') as string
  const phone = formData.get('phone') as string
  if (typeof display_name !== 'string' || !display_name.trim() || display_name.length > 100) return 'Display name must be between 1 and 100 characters'
  if (phone != null && (typeof phone !== 'string' || phone.length > 50)) return 'Phone must be at most 50 characters'

  const { error } = await supabase
    .from('profiles')
    .update({ display_name, phone })
    .eq('id', user.id)

  if (error) return error.message

  return null
}

export async function updateAvatar(key: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  if (!isOwnedObjectKey(key, user.id, 'avatars')) throw new Error('Invalid avatar key')

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: getPublicUrl(key) })
    .eq('id', user.id)

  if (error) throw new Error(error.message)

  revalidatePath('/', 'layout')
}
