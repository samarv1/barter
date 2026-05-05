'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function toggleSaveListing(listingId: string, currentlySaved: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  if (currentlySaved) {
    await supabase.from('saved_listings').delete()
      .eq('user_id', user.id).eq('listing_id', listingId)
  } else {
    await supabase.from('saved_listings').insert({ user_id: user.id, listing_id: listingId })
  }

  revalidatePath(`/listings/${listingId}`)
}
