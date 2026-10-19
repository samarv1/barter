# Barter

A marketplace for the UC Davis community to sell, give away, and find items around student move-in and move-out dates.

Barter is a portfolio project shared as source code. There is no hosted demo, and no public launch is planned. The instructions below are for running your own development setup.

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

## How it fits together

Next.js Server Components read listing and account data through a session-aware Supabase client. Server Actions handle marketplace mutations, while route handlers create listings and authorize photo uploads. Privileged server-side operations use a separate Supabase service-role client; its key never belongs in a `NEXT_PUBLIC_` variable.

An offer has a current amount, status, and whose turn it is. A separate append-only event table preserves the history, so counteroffers don't erase earlier prices. A listing's claimed state is distinct from sold: agreement on a price isn't the same as a completed pickup.

Database functions handle offer submission, responses, and listing transitions in transactions. Locking the listing serializes competing accepts, while a unique index prevents more than one accepted offer per listing. Column-level permissions prevent clients from changing identity verification fields or bypassing the offer workflow with direct table updates.

Photos go straight to S3 after the server authenticates the uploader and issues a five-minute upload URL. The database stores object keys rather than image blobs. HEIC photos are converted to JPEG in the browser before upload.

## Project structure

| Path | Purpose |
| --- | --- |
| `src/app/` | Marketplace, listing detail, inbox, profile, and authentication routes |
| `src/app/api/` | Listing creation and presigned photo upload handlers |
| `src/actions/` | Offers, listing lifecycle, profiles, saves, and notifications |
| `src/components/` | Listing forms, photo upload, navigation, and shadcn/ui components |
| `src/lib/` | Supabase clients, S3 uploads, and email delivery |
| `supabase/` | Database schema and migrations |
| `scripts/seed.mjs` | Sample listings and negotiation states for development |

## Local setup

Use Node.js 22 LTS and npm. You'll need a dedicated development Supabase project, Google OAuth credentials, and an S3 bucket for photo uploads. Resend is optional.

```bash
npm ci
cp .env.example .env.local
```

Fill in `.env.local` with your development credentials. The example documents every environment variable used by the app. Keep the Supabase service-role key, AWS credentials, and Resend key server-side.

### Database

For a new Supabase project, run `supabase/schema.sql` once in its SQL editor, then apply the SQL files in `supabase/migrations/` in filename order. This includes `202610190001_marketplace_integrity.sql`, which adds the transaction functions and permission restrictions required by the application. Apply this migration before deploying the matching app changes to an existing installation. The base schema is not a migration runner and should not be rerun against an existing database. For an existing installation, apply only migrations it has not already received.

### Authentication

Enable the Google provider in Supabase Auth and configure its Google client ID and secret. In the Google OAuth client, register the callback URL supplied by Supabase. In Supabase's Auth URL configuration, allow `http://localhost:3000/auth/callback` and set the local site URL to `http://localhost:3000`.

The app uses Google sign-in. Posting requires an `@ucdavis.edu` account; signing in with another domain allows buyer flows.

### Photos

Configure an S3 bucket for public listing and avatar images. The current app builds direct S3 object URLs, so uploaded objects need public read access. Do not use a bucket that contains private files. Give the server's AWS credentials permission to upload and delete objects in this dedicated bucket, and allow browser `PUT` requests from `http://localhost:3000` in its CORS configuration, including the `Content-Type` header.

Set both the server and `NEXT_PUBLIC_` bucket/region variables to the same values.

### Email

Leave `RESEND_API_KEY` empty to disable email delivery during development. In-app notifications are stored separately. To enable email, supply a Resend API key and an allowed sender in `RESEND_FROM_EMAIL`. Set `NEXT_PUBLIC_BASE_URL` to the app URL so email links point to the right environment.

### Run

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000).

### Sample data

In `.env.local`, set `SEED_TARGET_URL` to exactly match your disposable development project's `NEXT_PUBLIC_SUPABASE_URL`, and set `SEED_PASSWORD` to a unique development-only password of at least 16 characters. The script refuses to run without this explicit target acknowledgment or with `NODE_ENV=production`.

```bash
npm run seed
```

Run this only against a disposable development Supabase project. It deletes and recreates the script's three seed accounts and their associated data, covering active listings, claims, counteroffers, and completed sales. It uses the service-role key and does not require S3 photos. These fixtures use synthetic email addresses; they are not Google accounts and cannot sign in through the app's Google-only login screen.

## Checks

```bash
npm run lint
npm run test:unit
npx tsc --noEmit
npm run build
```

The database integration suite requires PostgreSQL 16+ tools (`initdb`, `pg_ctl`, and `psql`) on your `PATH`, or `PG_BIN` set to their directory:

```bash
npm run test:db
# If PostgreSQL tools are not on PATH:
PG_BIN=/path/to/postgresql/bin npm run test:db
```

It creates and removes its own temporary local database cluster, loads the schema and migrations, and checks permissions and offer transitions. It does not connect to your Supabase project or need application credentials. The suite supplies minimal Supabase Auth roles and identity helpers; hosted OAuth, email delivery, and browser flows still need separate end-to-end verification.

## Current scope

Barter coordinates offers and local pickup; it does not process payments or ship items. Email delivery is best-effort, without a durable retry queue. Cloud resources and OAuth credentials are configured separately from this repository.

The current profile read policy exposes contact fields to authenticated accounts. Upload authorization validates file types and ownership, but server-enforced upload size limits and rate limits are not implemented.
