-- Apply once to an existing deployment before deploying the matching application.
BEGIN;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- Identity and verification are derived from Auth, never from browser input.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles (id, email, is_davis_email)
  VALUES (NEW.id, NEW.email, NEW.email_confirmed_at IS NOT NULL AND NEW.email ILIKE '%@ucdavis.edu')
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, is_davis_email = EXCLUDED.is_davis_email;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_identity_updated ON auth.users;
CREATE TRIGGER on_auth_user_identity_updated
AFTER UPDATE OF email, email_confirmed_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
UPDATE public.profiles p SET email = u.email,
  is_davis_email = u.email_confirmed_at IS NOT NULL AND u.email ILIKE '%@ucdavis.edu'
FROM auth.users u WHERE p.id = u.id;

REVOKE INSERT, UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (display_name, phone, avatar_url) ON public.profiles TO authenticated;
REVOKE UPDATE ON public.notifications FROM anon, authenticated;
GRANT UPDATE (read) ON public.notifications TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.offers, public.offer_events FROM anon, authenticated;
DROP POLICY IF EXISTS "offers: buyer can insert" ON public.offers;
DROP POLICY IF EXISTS "offers: buyer or seller can update" ON public.offers;

REVOKE INSERT, UPDATE ON public.listings FROM anon, authenticated;
GRANT INSERT (seller_id, title, description, price, is_free, category, availability, photo_keys)
  ON public.listings TO authenticated;
GRANT UPDATE (title, description, price, is_free, category, availability, photo_keys)
  ON public.listings TO authenticated;
DROP POLICY IF EXISTS "listings: authenticated can insert" ON public.listings;
CREATE POLICY "listings: authenticated can insert" ON public.listings FOR INSERT TO authenticated
WITH CHECK (auth.uid() = seller_id AND status = 'active' AND EXISTS (
  SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_davis_email
));
DROP POLICY IF EXISTS "listings: seller can update" ON public.listings;
CREATE POLICY "listings: seller can update" ON public.listings FOR UPDATE TO authenticated
USING (auth.uid() = seller_id AND status = 'active')
WITH CHECK (auth.uid() = seller_id AND status = 'active');

-- Refuse migration if old data has duplicate accepted offers; resolve it explicitly.
CREATE UNIQUE INDEX IF NOT EXISTS offers_one_accepted_per_listing
  ON public.offers (listing_id) WHERE status = 'accepted';

-- All marketplace mutations acquire the listing lock first. This serializes
-- competing accepts, submissions, seller edits, closing, and relisting.
CREATE OR REPLACE FUNCTION public.submit_offer(
  p_listing_id uuid, p_offer_type text, p_amount numeric DEFAULT NULL, p_message text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_listing public.listings%ROWTYPE;
  v_offer public.offers%ROWTYPE;
  v_amount numeric(10,2);
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_listing FROM public.listings WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF v_listing.status <> 'active' THEN RAISE EXCEPTION 'Listing is no longer active'; END IF;
  IF v_listing.seller_id = v_user THEN RAISE EXCEPTION 'Cannot offer on your own listing'; END IF;
  IF p_offer_type IS NULL OR p_offer_type NOT IN ('claim','negotiation') THEN RAISE EXCEPTION 'Invalid offer type'; END IF;
  v_amount := CASE WHEN p_offer_type = 'claim' THEN CASE WHEN v_listing.is_free THEN 0 ELSE v_listing.price END ELSE p_amount END;
  IF v_amount IS NULL OR v_amount::text IN ('NaN','Infinity','-Infinity') OR v_amount < 0
    OR (p_offer_type = 'negotiation' AND v_amount <= 0) THEN RAISE EXCEPTION 'Invalid offer amount'; END IF;
  SELECT * INTO v_offer FROM public.offers WHERE listing_id = p_listing_id AND buyer_id = v_user FOR UPDATE;
  IF FOUND THEN
    IF v_offer.status <> 'declined' THEN RAISE EXCEPTION 'You already have an active offer on this listing'; END IF;
    UPDATE public.offers SET amount = v_amount, status = 'pending', current_turn = 'seller',
      offer_type = p_offer_type, message = CASE WHEN p_offer_type = 'claim' THEN NULL ELSE p_message END
      WHERE id = v_offer.id RETURNING * INTO v_offer;
  ELSE
    INSERT INTO public.offers (listing_id, buyer_id, amount, offer_type, message)
    VALUES (p_listing_id, v_user, v_amount, p_offer_type, CASE WHEN p_offer_type = 'claim' THEN NULL ELSE p_message END)
    RETURNING * INTO v_offer;
  END IF;
  INSERT INTO public.offer_events (offer_id, actor_id, event_type, amount, message)
  VALUES (v_offer.id, v_user, 'offer', v_amount, v_offer.message);
  INSERT INTO public.notifications (user_id, type, message, link)
  VALUES (v_listing.seller_id, 'new_offer',
    CASE WHEN p_offer_type = 'claim' THEN 'A buyer wants to claim your listing "' || v_listing.title || '" at the listed price. Accept or decline in your inbox.'
    ELSE 'New offer of $' || v_amount || ' on your listing "' || v_listing.title || '".' END,
    '/listings/' || p_listing_id);
  RETURN jsonb_build_object('listing_id', p_listing_id, 'title', v_listing.title, 'is_free', v_listing.is_free,
    'amount', v_amount, 'recipient_ids', jsonb_build_array(v_listing.seller_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_to_offer(
  p_offer_id uuid, p_action text, p_amount numeric DEFAULT NULL, p_message text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_listing public.listings%ROWTYPE;
  v_offer public.offers%ROWTYPE;
  v_other public.offers%ROWTYPE;
  v_listing_id uuid;
  v_recipient uuid;
  v_role text;
  v_declined jsonb := '[]'::jsonb;
  v_amount numeric(10,2);
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_action IS NULL OR p_action NOT IN ('accept','decline','counter') THEN RAISE EXCEPTION 'Invalid response'; END IF;
  SELECT listing_id INTO v_listing_id FROM public.offers WHERE id = p_offer_id;
  SELECT * INTO v_listing FROM public.listings WHERE id = v_listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found'; END IF;
  SELECT * INTO v_offer FROM public.offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found'; END IF;
  v_role := CASE WHEN v_user = v_listing.seller_id THEN 'seller' WHEN v_user = v_offer.buyer_id THEN 'buyer' END;
  IF v_role IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_listing.status <> 'active' OR v_offer.status NOT IN ('pending','countered') THEN RAISE EXCEPTION 'Offer is no longer active'; END IF;
  IF v_offer.current_turn <> v_role THEN RAISE EXCEPTION 'Not your turn'; END IF;
  v_recipient := CASE WHEN v_role = 'seller' THEN v_offer.buyer_id ELSE v_listing.seller_id END;
  IF p_action = 'counter' THEN
    IF v_offer.offer_type = 'claim' THEN RAISE EXCEPTION 'Cannot counter a full-price claim'; END IF;
    v_amount := p_amount;
    IF v_amount IS NULL OR v_amount::text IN ('NaN','Infinity','-Infinity') OR v_amount <= 0 THEN RAISE EXCEPTION 'Invalid counter amount'; END IF;
    UPDATE public.offers SET status = 'countered', amount = v_amount, message = p_message,
      current_turn = CASE WHEN v_role = 'seller' THEN 'buyer' ELSE 'seller' END WHERE id = p_offer_id;
  ELSE
    v_amount := v_offer.amount;
    UPDATE public.offers SET status = CASE WHEN p_action = 'accept' THEN 'accepted' ELSE 'declined' END WHERE id = p_offer_id;
  END IF;
  INSERT INTO public.offer_events (offer_id, actor_id, event_type, amount, message)
  VALUES (p_offer_id, v_user, CASE p_action WHEN 'accept' THEN 'accepted' WHEN 'decline' THEN 'declined' ELSE 'counter' END,
    CASE WHEN p_action = 'decline' THEN NULL ELSE v_amount END, CASE WHEN p_action = 'counter' THEN p_message END);
  IF p_action = 'accept' THEN
    UPDATE public.listings SET status = 'claimed' WHERE id = v_listing.id;
    FOR v_other IN UPDATE public.offers SET status = 'declined'
      WHERE listing_id = v_listing.id AND id <> p_offer_id AND status IN ('pending','countered') RETURNING *
    LOOP
      INSERT INTO public.offer_events (offer_id, actor_id, event_type) VALUES (v_other.id, v_user, 'declined');
      INSERT INTO public.notifications (user_id, type, message, link)
      VALUES (v_other.buyer_id, 'offer_declined', 'Your offer on "' || v_listing.title || '" was not selected. The listing has been claimed.', '/listings/' || v_listing.id);
      v_declined := v_declined || jsonb_build_array(v_other.buyer_id);
    END LOOP;
  END IF;
  INSERT INTO public.notifications (user_id, type, message, link)
  VALUES (v_recipient, CASE p_action WHEN 'accept' THEN 'offer_accepted' WHEN 'decline' THEN 'offer_declined' ELSE 'offer_countered' END,
    CASE p_action WHEN 'accept' THEN 'The offer on "' || v_listing.title || '" was accepted. Arrange pickup with the other participant.'
    WHEN 'decline' THEN 'The offer on "' || v_listing.title || '" was declined.'
    ELSE 'Counter-offer of $' || v_amount || ' on "' || v_listing.title || '".' END, '/listings/' || v_listing.id);
  RETURN jsonb_build_object('listing_id', v_listing.id, 'title', v_listing.title, 'amount', v_amount,
    'recipient_ids', CASE WHEN p_action = 'accept' AND v_role = 'buyer' THEN '[]'::jsonb ELSE jsonb_build_array(v_recipient) END, 'declined_recipient_ids', v_declined);
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_listing(p_listing_id uuid, p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_listing public.listings%ROWTYPE;
  v_offer public.offers%ROWTYPE;
  v_recipient uuid;
  v_recipients jsonb := '[]'::jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_listing FROM public.listings WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND OR v_listing.seller_id <> v_user THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_action IS NULL OR p_action NOT IN ('mark_sold','complete','relist','relist_claimed') THEN RAISE EXCEPTION 'Invalid transition'; END IF;
  IF p_action = 'mark_sold' AND v_listing.status <> 'active' THEN RAISE EXCEPTION 'Listing already closed'; END IF;
  IF p_action IN ('complete','relist_claimed') AND v_listing.status <> 'claimed' THEN RAISE EXCEPTION 'Listing is not claimed'; END IF;
  IF p_action = 'relist' AND v_listing.status = 'active' THEN RAISE EXCEPTION 'Listing is already active'; END IF;
  IF p_action <> 'complete' THEN
    FOR v_offer IN UPDATE public.offers SET status = 'declined'
      WHERE listing_id = p_listing_id AND status IN ('pending','countered','accepted') RETURNING *
    LOOP
      INSERT INTO public.offer_events (offer_id, actor_id, event_type) VALUES (v_offer.id, v_user, 'declined');
      INSERT INTO public.notifications (user_id, type, message, link)
      VALUES (v_offer.buyer_id, 'offer_declined', CASE WHEN p_action = 'mark_sold'
        THEN 'The listing "' || v_listing.title || '" has been marked as sold.'
        ELSE 'The listing "' || v_listing.title || '" has been relisted. Your previous offer is closed.' END, '/listings/' || p_listing_id);
      IF p_action = 'mark_sold' THEN v_recipients := v_recipients || jsonb_build_array(v_offer.buyer_id); END IF;
    END LOOP;
  END IF;
  UPDATE public.listings SET status = CASE p_action WHEN 'mark_sold' THEN 'claimed' WHEN 'complete' THEN 'sold' ELSE 'active' END
  WHERE id = p_listing_id;
  IF p_action IN ('relist','relist_claimed') THEN
    FOR v_recipient IN SELECT user_id FROM public.saved_listings WHERE listing_id = p_listing_id AND user_id <> v_user LOOP
      INSERT INTO public.notifications (user_id, type, message, link)
      VALUES (v_recipient, 'listing_relisted', 'A listing you saved is available again.', '/listings/' || p_listing_id);
      v_recipients := v_recipients || jsonb_build_array(v_recipient);
    END LOOP;
  END IF;
  RETURN jsonb_build_object('listing_id', p_listing_id, 'title', v_listing.title, 'recipient_ids', v_recipients);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_offer(uuid,text,numeric,text),
  public.respond_to_offer(uuid,text,numeric,text), public.transition_listing(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_offer(uuid,text,numeric,text),
  public.respond_to_offer(uuid,text,numeric,text), public.transition_listing(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
COMMIT;
