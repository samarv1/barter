/**
 * Seed script — wipes all seeded users and recreates test data covering every listing/offer state.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed.mjs
 *
 * Test accounts (all use the same password below):
 *   seed-seller@davis.test  — posts all listings
 *   seed-buyer1@davis.test  — most offers
 *   seed-buyer2@davis.test  — some offers
 */

import { createClient } from '@supabase/supabase-js'

const SEED_PASSWORD = 'SeedTest123!'
const SEED_USERS = [
  { email: 'seed-seller@davis.test', displayName: 'Taylor (Seller)' },
  { email: 'seed-buyer1@davis.test', displayName: 'Jordan (Buyer 1)' },
  { email: 'seed-buyer2@davis.test', displayName: 'Riley (Buyer 2)' },
]

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ─── helpers ───────────────────────────────────────────────────────────────

function ok(label, { data, error }) {
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}

async function insertListing(sellerId, fields) {
  const { data, error } = await supabase
    .from('listings')
    .insert({ seller_id: sellerId, photo_keys: [], ...fields })
    .select('id')
    .single()
  if (error) throw new Error(`insertListing "${fields.title}": ${error.message}`)
  return data.id
}

async function insertOffer(listingId, offerFields, events) {
  const { data, error } = await supabase
    .from('offers')
    .insert({ listing_id: listingId, ...offerFields })
    .select('id')
    .single()
  if (error) throw new Error(`insertOffer on ${listingId}: ${error.message}`)
  const offerId = data.id

  if (events.length > 0) {
    const { error: evErr } = await supabase
      .from('offer_events')
      .insert(events.map(e => ({ offer_id: offerId, ...e })))
    if (evErr) throw new Error(`insertOffer events: ${evErr.message}`)
  }
  return offerId
}

// ─── wipe ──────────────────────────────────────────────────────────────────

async function wipe() {
  console.log('Wiping existing seed users…')
  const { data: { users }, error } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error

  for (const seedUser of SEED_USERS) {
    const existing = users.find(u => u.email === seedUser.email)
    if (existing) {
      ok(`delete ${seedUser.email}`, await supabase.auth.admin.deleteUser(existing.id))
      console.log(`  deleted ${seedUser.email}`)
    }
  }
}

// ─── users ─────────────────────────────────────────────────────────────────

async function createUsers() {
  console.log('\nCreating seed users…')
  const ids = {}

  for (const u of SEED_USERS) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: SEED_PASSWORD,
      email_confirm: true,
    })
    if (error) throw new Error(`createUser ${u.email}: ${error.message}`)

    ids[u.email] = data.user.id

    // Upsert profile (trigger auto-creates it, but display_name needs setting)
    await supabase.from('profiles').upsert({
      id: data.user.id,
      email: u.email,
      display_name: u.displayName,
      is_davis_email: false,
    })

    console.log(`  ${u.email}  ${data.user.id}`)
  }

  return ids
}

// ─── seed data ─────────────────────────────────────────────────────────────

async function seed({ seller, buyer1, buyer2 }) {
  console.log('\nSeeding listings and offers…')

  // ── 1. Active, no offers ────────────────────────────────────────────────
  await insertListing(seller, {
    title: 'Couch (Tan 3-seater)',
    description: 'Comfortable couch, minor wear on armrests. Moving out end of June.',
    price: 150,
    is_free: false,
    category: 'furniture',
    availability: 'end_of_summer',
    status: 'active',
  })
  console.log('  ✓ active — no offers')

  // ── 2. Active + pending offer, seller's turn ────────────────────────────
  const l2 = await insertListing(seller, {
    title: 'Standing Desk (60")',
    description: 'Height-adjustable. Great condition, all parts included.',
    price: 120,
    is_free: false,
    category: 'furniture',
    availability: 'asap',
    status: 'active',
  })
  await insertOffer(l2, {
    buyer_id: buyer1,
    amount: 80,
    status: 'pending',
    current_turn: 'seller',
    offer_type: 'negotiation',
    message: 'Would you take $80? I can pick up this weekend.',
  }, [
    { actor_id: buyer1, event_type: 'offer', amount: 80, message: 'Would you take $80? I can pick up this weekend.' },
  ])
  console.log('  ✓ active — pending offer (seller\'s turn)')

  // ── 3. Active + counter-offer, buyer's turn ─────────────────────────────
  const l3 = await insertListing(seller, {
    title: 'Kryptonite U-Lock',
    description: 'Series 2, used one year. Still very secure.',
    price: 30,
    is_free: false,
    category: 'bikes',
    availability: 'asap',
    status: 'active',
  })
  await insertOffer(l3, {
    buyer_id: buyer1,
    amount: 25,
    status: 'countered',
    current_turn: 'buyer',
    offer_type: 'negotiation',
  }, [
    { actor_id: buyer1, event_type: 'offer', amount: 20, message: null },
    { actor_id: seller, event_type: 'counter', amount: 25, message: 'How about $25? That\'s as low as I can go.' },
  ])
  console.log('  ✓ active — counter-offer (buyer\'s turn)')

  // ── 4. Active + claim at listed price, seller's turn ───────────────────
  const l4 = await insertListing(seller, {
    title: 'CS Textbook Bundle',
    description: 'ECS 20, ECS 36A, ECS 122A. Good condition, minimal highlighting.',
    price: 45,
    is_free: false,
    category: 'books',
    availability: 'beginning_of_summer',
    status: 'active',
  })
  await insertOffer(l4, {
    buyer_id: buyer2,
    amount: 45,
    status: 'pending',
    current_turn: 'seller',
    offer_type: 'claim',
  }, [
    { actor_id: buyer2, event_type: 'offer', amount: 45, message: null },
  ])
  console.log('  ✓ active — claimed at listed price (seller\'s turn)')

  // ── 5. Active + two offers from different buyers ────────────────────────
  const l5 = await insertListing(seller, {
    title: 'Monitor (24", 1080p)',
    description: 'Dell, works perfectly. Includes stand and power cable.',
    price: 90,
    is_free: false,
    category: 'electronics',
    availability: 'asap',
    status: 'active',
  })
  await insertOffer(l5, {
    buyer_id: buyer1,
    amount: 70,
    status: 'pending',
    current_turn: 'seller',
    offer_type: 'negotiation',
  }, [
    { actor_id: buyer1, event_type: 'offer', amount: 70, message: 'Interested! Would take $70.' },
  ])
  await insertOffer(l5, {
    buyer_id: buyer2,
    amount: 90,
    status: 'pending',
    current_turn: 'seller',
    offer_type: 'claim',
  }, [
    { actor_id: buyer2, event_type: 'offer', amount: 90, message: null },
  ])
  console.log('  ✓ active — two competing offers (both pending, seller\'s turn)')

  // ── 6. Active + declined offer ──────────────────────────────────────────
  const l6 = await insertListing(seller, {
    title: 'Ergonomic Desk Chair',
    description: 'Mesh back, lumbar support. Minor scuff on left armrest.',
    price: 65,
    is_free: false,
    category: 'furniture',
    availability: 'end_of_summer',
    status: 'active',
  })
  await insertOffer(l6, {
    buyer_id: buyer1,
    amount: 30,
    status: 'declined',
    current_turn: 'buyer',
    offer_type: 'negotiation',
  }, [
    { actor_id: buyer1, event_type: 'offer', amount: 30, message: 'Best I can do, sorry!' },
    { actor_id: seller, event_type: 'declined', amount: null, message: null },
  ])
  console.log('  ✓ active — offer declined')

  // ── 7. Free listing, no offers ──────────────────────────────────────────
  await insertListing(seller, {
    title: 'Floor Lamp',
    description: 'Works fine. Just don\'t need it anymore.',
    price: null,
    is_free: true,
    category: 'other',
    availability: 'asap',
    status: 'active',
  })
  console.log('  ✓ active — free, no offers')

  // ── 8. Claimed (pending pickup) ─────────────────────────────────────────
  const l8 = await insertListing(seller, {
    title: 'Coffee Table (IKEA Hemnes)',
    description: 'Good condition, small scratch on top. Easy disassembly.',
    price: 60,
    is_free: false,
    category: 'furniture',
    availability: 'asap',
    status: 'claimed',
  })
  await insertOffer(l8, {
    buyer_id: buyer1,
    amount: 60,
    status: 'accepted',
    current_turn: 'seller',
    offer_type: 'negotiation',
  }, [
    { actor_id: buyer1, event_type: 'offer', amount: 50, message: null },
    { actor_id: seller, event_type: 'counter', amount: 60, message: null },
    { actor_id: buyer1, event_type: 'accepted', amount: 60, message: null },
  ])
  console.log('  ✓ claimed — pending pickup (offer accepted)')

  // ── 9. Sold (fully complete) ────────────────────────────────────────────
  const l9 = await insertListing(seller, {
    title: 'Mini Fridge (3.2 cu ft)',
    description: 'Compact, works perfectly. Great for a dorm.',
    price: 80,
    is_free: false,
    category: 'appliances',
    availability: 'asap',
    status: 'sold',
  })
  await insertOffer(l9, {
    buyer_id: buyer2,
    amount: 75,
    status: 'accepted',
    current_turn: 'seller',
    offer_type: 'negotiation',
  }, [
    { actor_id: buyer2, event_type: 'offer', amount: 70, message: null },
    { actor_id: seller, event_type: 'counter', amount: 75, message: null },
    { actor_id: buyer2, event_type: 'accepted', amount: 75, message: null },
  ])
  console.log('  ✓ sold — pickup confirmed')
}

// ─── main ──────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
    console.error('Run with: node --env-file=.env.local scripts/seed.mjs')
    process.exit(1)
  }

  try {
    await wipe()
    const ids = await createUsers()
    await seed({
      seller: ids['seed-seller@davis.test'],
      buyer1: ids['seed-buyer1@davis.test'],
      buyer2: ids['seed-buyer2@davis.test'],
    })

    console.log('\n✓ Seed complete.\n')
    console.log(`Password for all accounts: ${SEED_PASSWORD}\n`)
    console.log('Accounts:')
    for (const u of SEED_USERS) {
      console.log(`  ${u.email.padEnd(30)} ${u.displayName}`)
    }
    console.log()
  } catch (err) {
    console.error('\nSeed failed:', err.message)
    process.exit(1)
  }
}

main()
