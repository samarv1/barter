import { NextRequest, NextResponse } from 'next/server'
import { validateListingInput } from '@/lib/validation'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_davis_email')
    .eq('id', user.id)
    .single()

  if (!profile?.is_davis_email) {
    return NextResponse.json(
      { error: 'Only @ucdavis.edu accounts can post listings' },
      { status: 403 }
    )
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const validationError = validateListingInput(body, user.id)
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })
  const { title, description, price, is_free, category, availability, photo_keys } = body

  if (!photo_keys || photo_keys.length === 0) {
    return NextResponse.json({ error: 'At least one photo is required' }, { status: 400 })
  }

  const { data: listing, error } = await supabase
    .from('listings')
    .insert({
      seller_id: user.id,
      title,
      description,
      price: is_free ? null : price,
      is_free,
      category,
      availability,
      photo_keys,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fire alert matching in the background (non-blocking)
  matchAlerts({ listingId: listing.id, title, description, sellerId: user.id }).catch(console.error)

  return NextResponse.json({ id: listing.id }, { status: 201 })
}

async function matchAlerts({
  listingId,
  title,
  description,
  sellerId,
}: {
  listingId: string
  title: string
  description: string
  sellerId: string
}) {
  const serviceSupabase = createServiceClient()

  const searchText = `${title} ${description ?? ''}`

  const { data: alerts } = await serviceSupabase
    .from('saved_alerts')
    .select('id, user_id, keyword, profiles(email)')
    .neq('user_id', sellerId)

  if (!alerts || alerts.length === 0) return

  const matched = alerts.filter(a =>
    searchText.toLowerCase().includes(a.keyword.toLowerCase())
  )

  if (matched.length === 0) return

  await serviceSupabase.from('notifications').insert(
    matched.map(a => ({
      user_id: a.user_id,
      type: 'alert_match',
      message: `A new listing matching "${a.keyword}" was posted: ${title}`,
      link: `/listings/${listingId}`,
    }))
  )
}
