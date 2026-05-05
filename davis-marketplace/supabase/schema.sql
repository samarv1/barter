-- Davis Marketplace — full schema
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query)

-- ─────────────────────────────────────────────
-- PROFILES
-- ─────────────────────────────────────────────

CREATE TABLE public.profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           text NOT NULL,
  display_name    text,
  phone           text,
  is_davis_email  boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Auto-create profile row when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, is_davis_email)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.email ILIKE '%@ucdavis.edu'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: anyone authenticated can read"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "profiles: owner can update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);


-- ─────────────────────────────────────────────
-- LISTINGS
-- ─────────────────────────────────────────────

CREATE TABLE public.listings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  price         numeric(10, 2),
  is_free       boolean NOT NULL DEFAULT false,
  category      text NOT NULL CHECK (category IN ('furniture','electronics','clothing','books','appliances','bikes','sports','other')),
  availability  text NOT NULL CHECK (availability IN ('asap','beginning_of_summer','end_of_summer')),
  photo_keys    text[] NOT NULL,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','claimed','sold')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Full-text search index
CREATE INDEX listings_fts_idx
  ON public.listings
  USING GIN (to_tsvector('english', title || ' ' || coalesce(description, '')));

CREATE INDEX listings_status_idx      ON public.listings (status);
CREATE INDEX listings_category_idx    ON public.listings (category);
CREATE INDEX listings_availability_idx ON public.listings (availability);
CREATE INDEX listings_seller_id_idx   ON public.listings (seller_id);

CREATE TRIGGER listings_updated_at
  BEFORE UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Search function called via supabase.rpc('search_listings')
CREATE OR REPLACE FUNCTION public.search_listings(
  keyword           text DEFAULT NULL,
  filter_category   text DEFAULT NULL,
  filter_availability text DEFAULT NULL
)
RETURNS SETOF public.listings AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.listings
  WHERE status IN ('active', 'claimed')
    AND (
      keyword IS NULL OR
      to_tsvector('english', title || ' ' || coalesce(description, '')) @@
      plainto_tsquery('english', keyword)
    )
    AND (filter_category    IS NULL OR category    = filter_category)
    AND (filter_availability IS NULL OR availability = filter_availability)
  ORDER BY
    CASE WHEN status = 'active' THEN 0 ELSE 1 END,
    created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- RLS
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "listings: anyone can read active or claimed"
  ON public.listings FOR SELECT
  USING (status IN ('active', 'claimed') OR auth.uid() = seller_id);

CREATE POLICY "listings: authenticated can insert"
  ON public.listings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "listings: seller can update"
  ON public.listings FOR UPDATE
  TO authenticated
  USING (auth.uid() = seller_id)
  WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "listings: seller can delete"
  ON public.listings FOR DELETE
  TO authenticated
  USING (auth.uid() = seller_id);


-- ─────────────────────────────────────────────
-- OFFERS
-- ─────────────────────────────────────────────

CREATE TABLE public.offers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id   uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  buyer_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount       numeric(10, 2) NOT NULL,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','countered')),
  current_turn text NOT NULL DEFAULT 'seller' CHECK (current_turn IN ('buyer','seller')),
  offer_type   text NOT NULL DEFAULT 'negotiation' CHECK (offer_type IN ('claim','negotiation')),
  message      text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, buyer_id)
);

CREATE TRIGGER offers_updated_at
  BEFORE UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "offers: buyer or seller can read"
  ON public.offers FOR SELECT
  TO authenticated
  USING (
    auth.uid() = buyer_id OR
    auth.uid() = (SELECT seller_id FROM public.listings WHERE id = listing_id)
  );

CREATE POLICY "offers: buyer can insert"
  ON public.offers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = buyer_id);

CREATE POLICY "offers: buyer or seller can update"
  ON public.offers FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = buyer_id OR
    auth.uid() = (SELECT seller_id FROM public.listings WHERE id = listing_id)
  );


-- ─────────────────────────────────────────────
-- OFFER EVENTS (append-only thread log)
-- ─────────────────────────────────────────────

CREATE TABLE public.offer_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id   uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  actor_id   uuid NOT NULL REFERENCES public.profiles(id),
  event_type text NOT NULL CHECK (event_type IN ('offer','counter','accepted','declined')),
  amount     numeric(10, 2),
  message    text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX offer_events_offer_id_idx ON public.offer_events (offer_id);

-- RLS — read only for buyer/seller; inserts go through service role in API routes
ALTER TABLE public.offer_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "offer_events: buyer or seller can read"
  ON public.offer_events FOR SELECT
  TO authenticated
  USING (
    auth.uid() = (SELECT buyer_id  FROM public.offers o WHERE o.id = offer_id) OR
    auth.uid() = (SELECT l.seller_id FROM public.offers o
                  JOIN public.listings l ON l.id = o.listing_id
                  WHERE o.id = offer_id)
  );


-- ─────────────────────────────────────────────
-- SAVED ALERTS
-- ─────────────────────────────────────────────

CREATE TABLE public.saved_alerts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  keyword    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, keyword)
);

-- RLS
ALTER TABLE public.saved_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_alerts: owner can read"
  ON public.saved_alerts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "saved_alerts: owner can insert"
  ON public.saved_alerts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "saved_alerts: owner can delete"
  ON public.saved_alerts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────
-- SAVED LISTINGS
-- ─────────────────────────────────────────────

CREATE TABLE public.saved_listings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, listing_id)
);

ALTER TABLE public.saved_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_listings: owner can read"
  ON public.saved_listings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "saved_listings: owner can insert"
  ON public.saved_listings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "saved_listings: owner can delete"
  ON public.saved_listings FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────
-- NOTIFICATIONS
-- ─────────────────────────────────────────────

CREATE TABLE public.notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN ('new_offer','offer_accepted','offer_declined','offer_countered','alert_match','listing_relisted')),
  message    text NOT NULL,
  link       text,
  read       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_unread_idx
  ON public.notifications (user_id, read)
  WHERE read = false;

-- RLS — inserts go through service role key only
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications: owner can read"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "notifications: owner can mark read"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
