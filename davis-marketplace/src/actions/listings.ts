'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { deleteObjects } from '@/lib/s3'

export async function deleteListing(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: listing } = await supabase
    .from('listings')
    .select('seller_id, photo_keys')
    .eq('id', id)
    .single()

  if (!listing || listing.seller_id !== user.id) throw new Error('Unauthorized')

  if (listing.photo_keys?.length > 0) {
    await deleteObjects(listing.photo_keys)
  }

  await supabase.from('listings').delete().eq('id', id)

  redirect('/')
}
