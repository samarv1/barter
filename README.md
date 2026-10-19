# Barter

A marketplace for the UC Davis community to sell, give away, and find items around student move-in and move-out dates.

AggieWorks used to have a product called AggieExchange, which was archived. I wanted to build Barter because I believe there's strong product-market fit for a student marketplace at UC Davis, especially around move-in and move-out. I never launched it.

---

## The problem

Finding a couch is only half the problem when you're moving between student apartments. You also need it to be available when your lease starts, agree on a price, and know whether someone else has already claimed it. Barter brings availability, negotiation, and pickup status into the listing itself.

## How it works

**Browse.** Filter listings by category and availability: ASAP, beginning of summer, or end of summer. Save items to come back to later.

**Post.** Sellers sign in with a UC Davis Google account and create a listing with photos, a price or free label, and a pickup window. Other Google accounts can browse and make offers.

**Negotiate.** Buyers can request an item at its listed price or make an offer. Buyers and sellers take turns countering, accepting, or declining, with the conversation's price history kept in an offer timeline.

**Pick up.** Accepting an offer reserves the item for that buyer. The seller marks the sale complete after pickup, or relists it if the exchange falls through. Buyers who saved a relisted item get notified that it's available again.

**Keep track.** An inbox groups offer threads, and a seller dashboard tracks listings through active, claimed, and sold states. In-app notifications and optional email updates keep participants informed.

## Tech stack

- **Framework:** Next.js 16, React 19, TypeScript
- **Styling:** Tailwind CSS, shadcn/ui
- **Database & auth:** Supabase (Postgres, Google OAuth, row-level security)
- **Photos:** Amazon S3, uploaded directly from the browser using short-lived presigned URLs
- **Email:** Resend

## Project structure

```text
.
├── src/app/              # marketplace, listing detail, inbox, profile, and API routes
├── src/actions/          # offers, listing lifecycle, profiles, saves, and notifications
├── src/components/       # listing forms, photo upload, navigation, and UI components
├── src/lib/              # Supabase clients, S3 uploads, validation, and email delivery
├── supabase/             # base schema and migrations
├── scripts/seed.mjs      # sample listings and negotiation states
└── tests/                # input validation tests
```

## How it fits together

Next.js reads listings through a session-aware Supabase client. Server Actions handle offers and listing updates through database functions, so accepting an offer, closing competing offers, and creating notifications happen in one transaction. A listing lock and unique index prevent two buyers from having accepted offers on the same item.

Each offer keeps its current price and whose turn it is, with a separate event log for the negotiation history. Accepting an offer marks the listing as claimed; the seller marks it sold after pickup. Photos upload directly to S3 through short-lived URLs, with HEIC images converted to JPEG in the browser. Email updates use Resend and are optional.

---

## Local setup

Use Node.js 22 LTS and npm. You'll need a dedicated development Supabase project, Google OAuth credentials, and an S3 bucket for photo uploads. Resend is optional.

```bash
npm ci
cp .env.example .env.local
```

Fill in `.env.local` using the variables documented in `.env.example`. Keep the service-role key, AWS credentials, and Resend key server-side.

- **Database:** On a fresh Supabase project, run `supabase/schema.sql` once, then apply `supabase/migrations/` in filename order. For an existing database, apply only unapplied migrations.
- **Auth:** Enable Google sign-in in Supabase and register its callback URL in your Google OAuth client. Set the Supabase site URL to `http://localhost:3000` and allow `http://localhost:3000/auth/callback` as a redirect.
- **Photos:** Use a dedicated S3 bucket with public read access for images and server credentials scoped to upload and delete objects. Allow browser `PUT` requests from `http://localhost:3000` with the `Content-Type` header. The server and public bucket/region variables must match.
- **Email:** Leave `RESEND_API_KEY` empty to skip email delivery, or configure it with an allowed sender. Set `NEXT_PUBLIC_BASE_URL` to `http://localhost:3000`.

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000).

### Sample data

Set `SEED_TARGET_URL` to match your disposable development project's `NEXT_PUBLIC_SUPABASE_URL`, and `SEED_PASSWORD` to a unique password of at least 16 characters.

```bash
npm run seed
```

The script deletes and recreates three seed accounts and their data, covering active listings, claims, counteroffers, and completed sales. Use a disposable database. These accounts use synthetic emails and cannot sign in through Google.

## Tests

```bash
npm run lint
npm run test:unit
npx tsc --noEmit
npm run build
```

Database integration tests need PostgreSQL 16+ tools (`initdb`, `pg_ctl`, and `psql`) on your `PATH`, or `PG_BIN` set to their directory:

```bash
npm run test:db
# If PostgreSQL tools are not on PATH:
PG_BIN=/path/to/postgresql/bin npm run test:db
```

The suite creates a temporary local database and checks permissions, offer transitions, rollback, and competing accepts. It needs no Supabase credentials. Google sign-in, email delivery, and browser flows need separate testing.

## Current scope

Barter handles offers and local pickup, with no payments or shipping. Email has no retry queue. Profile contact fields are readable by signed-in users, and uploads do not yet have server-enforced size or rate limits.
