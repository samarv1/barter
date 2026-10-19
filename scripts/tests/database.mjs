// Integration tests against a disposable local PostgreSQL cluster, never a remote DB.
// Requires PostgreSQL 16+ tools on PATH, or PG_BIN pointing to their directory.
import assert from 'node:assert/strict'
import { spawnSync, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const bin = process.env.PG_BIN ?? ''
const executable = name => bin ? join(bin, name) : name
// macOS's default temp path can exceed PostgreSQL's Unix socket path limit.
const temp = mkdtempSync(join(process.platform === 'darwin' ? '/tmp' : tmpdir(), 'barter-db-test-'))
const data = join(temp, 'data')
const port = String(49000 + process.pid % 10000)
// Remove PG connection defaults so this harness cannot target another database.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')))
env.PGOPTIONS = '-c statement_timeout=15000'
const args = ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', temp, '-p', port, '-U', 'postgres', '-d', 'postgres']
function run(name, arguments_, input) {
  const result = spawnSync(executable(name), arguments_, { input, encoding: 'utf8', env })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${name}: ${result.stderr || result.stdout}`)
  return result.stdout.trim()
}
const sql = statement => run('psql', args, statement)
const actor = (id, statement) => `SET ROLE authenticated; SET request.jwt.claim.sub = '${id}'; ${statement}`
const asUser = (id, statement) => sql(actor(id, statement))
const denied = (id, statement) => assert.throws(() => asUser(id, statement))
function concurrentSql(statement) {
  return new Promise(resolve => {
    const child = spawn(executable('psql'), args, { env })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { output += chunk })
    child.on('error', error => resolve({ status: -1, output: error.message }))
    child.on('close', status => resolve({ status, output }))
    child.stdin.end(statement)
  })
}

let started = false
try {
  run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale',
    '--set=shared_memory_type=mmap', '--set=dynamic_shared_memory_type=mmap'])
  run('pg_ctl', ['-D', data, '-l', join(temp, 'postgres.log'), '-o', `-F -p ${port} -k ${temp} -c listen_addresses=''`, '-w', 'start'])
  started = true
  sql(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
    CREATE PUBLICATION supabase_realtime;
  `)
  sql(readFileSync(join(root, 'supabase/schema.sql'), 'utf8'))
  const migrations = join(root, 'supabase/migrations')
  if (existsSync(migrations)) {
    for (const name of readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()) {
      sql(readFileSync(join(migrations, name), 'utf8'))
    }
  }

  // Assertions follow below once the schema has been loaded.
  const seller = '10000000-0000-0000-0000-000000000001'
  const buyer = '10000000-0000-0000-0000-000000000002'
  const rival = '10000000-0000-0000-0000-000000000003'
  const outsider = '10000000-0000-0000-0000-000000000004'
  sql(`INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('${seller}', 'seller@ucdavis.edu', now()),
    ('${buyer}', 'buyer@example.com', now()),
    ('${rival}', 'rival@example.com', now()),
    ('${outsider}', 'outsider@example.com', now());`)
  asUser(buyer, `UPDATE public.profiles SET display_name = 'Buyer' WHERE id = '${buyer}';`)
  assert.equal(sql(`SELECT display_name FROM public.profiles WHERE id = '${buyer}'`), 'Buyer')
  denied(buyer, `UPDATE public.profiles SET is_davis_email = true WHERE id = '${buyer}'`)
  denied(buyer, `UPDATE public.profiles SET email = 'forged@ucdavis.edu' WHERE id = '${buyer}'`)

  const insertListing = user => `INSERT INTO public.listings
    (seller_id,title,price,category,availability,photo_keys)
    VALUES ('${user}','Test desk',100,'furniture','asap',ARRAY['test.jpg']) RETURNING id`
  denied(buyer, insertListing(buyer))
  const unconfirmed = '10000000-0000-0000-0000-000000000005'
  sql(`INSERT INTO auth.users (id,email) VALUES ('${unconfirmed}','unconfirmed@ucdavis.edu')`)
  denied(unconfirmed, insertListing(unconfirmed))
  sql(`UPDATE auth.users SET email_confirmed_at = now() WHERE id = '${unconfirmed}'`)
  assert.equal(sql(`SELECT is_davis_email FROM public.profiles WHERE id = '${unconfirmed}'`), 't')
  asUser(unconfirmed, insertListing(unconfirmed))

  const listing = asUser(seller, insertListing(seller))
  denied(seller, `UPDATE public.listings SET status = 'claimed' WHERE id = '${listing}'`)
  asUser(outsider, `UPDATE public.listings SET title = 'Stolen' WHERE id = '${listing}'`)
  assert.equal(sql(`SELECT title FROM public.listings WHERE id = '${listing}'`), 'Test desk')
  const submit = (id, type = 'negotiation', amount = '80') => `SELECT public.submit_offer('${id}','${type}',${amount})`
  denied(seller, submit(listing))
  denied(buyer, submit(listing, 'negotiation', '0'))
  denied(buyer, submit(listing, 'negotiation', "'NaN'::numeric"))
  denied(buyer, `INSERT INTO public.offers (listing_id,buyer_id,amount,status) VALUES ('${listing}','${buyer}',1,'accepted')`)
  asUser(buyer, submit(listing))
  asUser(rival, submit(listing, 'claim', '1'))
  const offer = sql(`SELECT id FROM public.offers WHERE listing_id = '${listing}' AND buyer_id = '${buyer}'`)
  const rivalOffer = sql(`SELECT id FROM public.offers WHERE listing_id = '${listing}' AND buyer_id = '${rival}'`)
  assert.equal(sql(`SELECT amount FROM public.offers WHERE id = '${rivalOffer}'`), '100.00')
  denied(buyer, submit(listing))
  denied(buyer, `UPDATE public.offers SET status = 'accepted' WHERE id = '${offer}'`)
  denied(buyer, `INSERT INTO public.offer_events (offer_id,actor_id,event_type) VALUES ('${offer}','${seller}','accepted')`)
  assert.equal(asUser(outsider, `SELECT count(*) FROM public.offers WHERE listing_id = '${listing}'`), '0')
  assert.equal(asUser(outsider, `SELECT count(*) FROM public.offer_events WHERE offer_id = '${offer}'`), '0')
  const respond = (id, action, amount = 'NULL') => `SELECT public.respond_to_offer('${id}','${action}',${amount})`
  denied(buyer, respond(offer, 'accept'))
  denied(outsider, respond(offer, 'accept'))
  denied(seller, respond(rivalOffer, 'counter', '120'))
  asUser(seller, respond(offer, 'counter', '90'))
  assert.equal(sql(`SELECT current_turn FROM public.offers WHERE id = '${offer}'`), 'buyer')
  denied(seller, respond(offer, 'accept'))
  denied(buyer, respond(offer, 'counter', '-1'))
  asUser(buyer, respond(offer, 'counter', '85'))

  // A failure late in acceptance must roll back status, history, and notifications.
  sql(`CREATE FUNCTION public.reject_test_notification() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.type = 'offer_accepted' THEN RAISE EXCEPTION 'Injected notification failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_test_notification BEFORE INSERT ON public.notifications
      FOR EACH ROW EXECUTE FUNCTION public.reject_test_notification();`)
  const before = sql(`SELECT (SELECT count(*) FROM public.offer_events) || ':' || (SELECT count(*) FROM public.notifications)`)
  denied(seller, respond(offer, 'accept'))
  assert.equal(sql(`SELECT status FROM public.listings WHERE id = '${listing}'`), 'active')
  assert.equal(sql(`SELECT status FROM public.offers WHERE id = '${offer}'`), 'countered')
  assert.equal(sql(`SELECT status FROM public.offers WHERE id = '${rivalOffer}'`), 'pending')
  assert.equal(sql(`SELECT (SELECT count(*) FROM public.offer_events) || ':' || (SELECT count(*) FROM public.notifications)`), before)
  sql('DROP TRIGGER reject_test_notification ON public.notifications; DROP FUNCTION public.reject_test_notification();')

  // Hold the shared listing lock, launch both requests, then release together.
  const lock = spawn(executable('psql'), args, { env })
  let lockOutput = ''
  lock.stdout.on('data', chunk => { lockOutput += chunk })
  lock.stderr.on('data', chunk => { lockOutput += chunk })
  const locked = new Promise((resolve, reject) => {
    lock.stdout.on('data', () => { if (lockOutput.includes('LOCK_READY')) resolve() })
    lock.on('error', reject)
    lock.on('close', code => { if (!lockOutput.includes('LOCK_READY')) reject(new Error(`Lock setup failed (${code}): ${lockOutput}`)) })
  })
  lock.stdin.write(`BEGIN; SELECT id FROM public.listings WHERE id = '${listing}' FOR UPDATE; SELECT 'LOCK_READY';\n`)
  await locked
  const requests = [concurrentSql(actor(seller, respond(offer, 'accept'))), concurrentSql(actor(seller, respond(rivalOffer, 'accept')))]
  lock.stdin.end('COMMIT;\n')
  const results = await Promise.all(requests)
  assert.equal(results.filter(result => result.status === 0).length, 1, JSON.stringify(results))
  assert.equal(sql(`SELECT count(*) FROM public.offers WHERE listing_id = '${listing}' AND status = 'accepted'`), '1')
  assert.equal(sql(`SELECT count(*) FROM public.offers WHERE listing_id = '${listing}' AND status = 'declined'`), '1')
  assert.equal(sql(`SELECT status FROM public.listings WHERE id = '${listing}'`), 'claimed')
  assert.equal(sql(`SELECT count(*) FROM public.offer_events WHERE offer_id IN ('${offer}','${rivalOffer}') AND event_type = 'accepted'`), '1')
  denied(outsider, submit(listing))
  denied(seller, respond(offer, 'accept'))

  const transition = action => `SELECT public.transition_listing('${listing}','${action}')`
  denied(buyer, transition('complete'))
  asUser(seller, transition('complete'))
  assert.equal(sql(`SELECT status FROM public.listings WHERE id = '${listing}'`), 'sold')
  denied(seller, transition('complete'))
  asUser(seller, transition('relist'))
  assert.equal(sql(`SELECT count(*) FROM public.offers WHERE listing_id = '${listing}' AND status = 'accepted'`), '0')
  denied(seller, transition('relist'))
  asUser(buyer, submit(listing, 'negotiation', '75'))
  assert.equal(sql(`SELECT status || ':' || offer_type FROM public.offers WHERE id = '${offer}'`), 'pending:negotiation')

  const notification = sql(`SELECT id FROM public.notifications WHERE user_id = '${buyer}' LIMIT 1`)
  asUser(buyer, `UPDATE public.notifications SET read = true WHERE id = '${notification}'`)
  denied(buyer, `UPDATE public.notifications SET message = 'Forged' WHERE id = '${notification}'`)
  assert.equal(asUser(outsider, `SELECT count(*) FROM public.notifications WHERE user_id = '${buyer}'`), '0')
  assert.throws(() => sql(`SET ROLE anon; ${submit(listing)}`))

  console.log('Database integration checks passed: permissions, Auth verification, offer turns, claims, rollback, concurrent acceptance, and listing transitions.')
} finally {
  try {
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'])
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}
