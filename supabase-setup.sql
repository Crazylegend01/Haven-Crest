-- ============================================================
--  Haven & Crest — Supabase Database Setup
--  Run this entire script in your Supabase SQL Editor.
--  (Dashboard → SQL Editor → New query → Paste → Run)
-- ============================================================


-- ─────────────────────────────────────────────────────────────
--  TABLE: public.waitlist
--  Stores early-access sign-ups from students, landlords,
--  and agents interested in the platform.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.waitlist (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL    DEFAULT now(),
  full_name   TEXT        NOT NULL,
  email       TEXT        NOT NULL UNIQUE,
  user_role   TEXT        NOT NULL CHECK (user_role IN ('student', 'landlord', 'agent')),
  campus_name TEXT
);

COMMENT ON TABLE  public.waitlist              IS 'Early-access waitlist registrations.';
COMMENT ON COLUMN public.waitlist.user_role    IS 'One of: student, landlord, agent.';
COMMENT ON COLUMN public.waitlist.campus_name  IS 'University / campus (relevant for student role).';


-- ─────────────────────────────────────────────────────────────
--  TABLE: public.suggestions
--  Community-submitted feedback and feature requests.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.suggestions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL    DEFAULT now(),
  author_name     TEXT        NOT NULL    DEFAULT 'Anonymous',
  category        TEXT        NOT NULL,
  suggestion_text TEXT        NOT NULL,
  status          TEXT        NOT NULL    DEFAULT 'pending'
);

COMMENT ON TABLE  public.suggestions             IS 'User-submitted suggestions and feedback.';
COMMENT ON COLUMN public.suggestions.status      IS 'Workflow state: pending → reviewed → done.';
COMMENT ON COLUMN public.suggestions.category    IS 'Free-form tag e.g. property, UX, pricing.';


-- ─────────────────────────────────────────────────────────────
--  TABLE: public.enquiries
--  General contact-form submissions from the website.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.enquiries (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL    DEFAULT now(),
  name       TEXT        NOT NULL,
  email      TEXT        NOT NULL,
  message    TEXT        NOT NULL
);

COMMENT ON TABLE public.enquiries IS 'Contact form submissions from the website.';


-- ─────────────────────────────────────────────────────────────
--  PROFILES TABLE (optional — for Supabase Auth admin role)
--  Required if you want the stricter audit-log RLS policy
--  that checks is_admin = true on a profiles row.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_admin BOOLEAN NOT NULL DEFAULT false
);

COMMENT ON TABLE  public.profiles          IS 'Per-user profile data tied to Supabase Auth.';
COMMENT ON COLUMN public.profiles.is_admin IS 'Grants access to admin-only RLS policies when true.';


-- ─────────────────────────────────────────────────────────────
--  ROW LEVEL SECURITY
--  Enable RLS on all tables, then add public INSERT policies so
--  anonymous visitors can submit data. All other operations
--  (SELECT, UPDATE, DELETE) require authentication by default.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.waitlist    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enquiries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;


-- waitlist: anyone can insert a row
CREATE POLICY "Public INSERT on waitlist"
  ON public.waitlist
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- suggestions: anyone can insert a row
CREATE POLICY "Public INSERT on suggestions"
  ON public.suggestions
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- enquiries: anyone can insert a row
CREATE POLICY "Public INSERT on enquiries"
  ON public.enquiries
  FOR INSERT
  TO anon
  WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────
--  ADMIN READ POLICIES
--  The admin dashboard (admin.html) uses the same anon key but
--  is protected by a client-side passcode gate.
--  Run these to allow the dashboard to fetch data.
--
--  ⚠ Note: because the anon key is visible in JS source, any
--  determined person could also query these tables directly.
--  For a static GitHub Pages site this is the accepted tradeoff.
--  If you need stricter access, move the admin to a server-side
--  route and use the Supabase service role key there instead.
-- ─────────────────────────────────────────────────────────────

-- waitlist: admin can read all rows
CREATE POLICY "Admin SELECT on waitlist"
  ON public.waitlist
  FOR SELECT
  TO anon
  USING (true);

-- suggestions: admin can read all rows
CREATE POLICY "Admin SELECT on suggestions"
  ON public.suggestions
  FOR SELECT
  TO anon
  USING (true);

-- suggestions: admin can toggle status (pending ↔ reviewed)
CREATE POLICY "Admin UPDATE status on suggestions"
  ON public.suggestions
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (status IN ('pending', 'reviewed'));


-- ─────────────────────────────────────────────────────────────
--  MIGRATION: add status column if table already exists
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.suggestions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';


-- =============================================================
--  SECURITY AUDIT & FRAUD LOG
--
--  Records metadata for flagged or sensitive actions.
--  IP addresses are captured client-side and stored for
--  fraud investigation.
--
--  action_type values in use:
--    WAITLIST_SUBMIT     — successful waitlist signup
--    SUGGESTION_SUBMIT   — successful suggestion submission
--    RATE_LIMIT_HIT      — client-side rate limit exceeded
--    BOT_DETECTED        — honeypot field was filled
--    SUSPICIOUS_CONTENT  — scam/spam keywords found in input
--    DUPLICATE_EMAIL     — email already on waitlist
--    ADMIN_LOGIN         — successful admin passcode entry
--    ADMIN_LOGIN_FAILED  — wrong passcode attempt
--    ADMIN_SIGNOUT       — admin clicked Sign Out
-- =============================================================

CREATE TABLE IF NOT EXISTS public.security_audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL    DEFAULT now(),
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type TEXT        NOT NULL,
  ip_address  TEXT,
  user_agent  TEXT,
  metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  risk_level  TEXT        NOT NULL DEFAULT 'LOW'
    CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'))
);

COMMENT ON TABLE  public.security_audit_logs IS 'Fraud detection and security event log.';
COMMENT ON COLUMN public.security_audit_logs.action_type IS 'Enumerated event type string.';
COMMENT ON COLUMN public.security_audit_logs.metadata    IS 'Arbitrary JSON context for the event.';
COMMENT ON COLUMN public.security_audit_logs.risk_level  IS 'LOW | MEDIUM | HIGH | CRITICAL';

ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

-- ── INSERT policy ──────────────────────────────────────────────
-- Allow public (anon) inserts so the client-side logger can write
-- events without requiring authentication.
CREATE POLICY "Allow system insert logs"
  ON public.security_audit_logs
  FOR INSERT
  WITH CHECK (true);

-- ── SELECT policy ─────────────────────────────────────────────
-- STRICT: only the Supabase service role OR an authenticated user
-- with is_admin = true on their profiles row may read audit logs.
-- Anonymous users (including the passcode-gated admin dashboard
-- running under the anon key) cannot read this table directly.
--
-- To view logs from the dashboard you would need to:
--   a) Use the Supabase Dashboard → Table Editor, or
--   b) Upgrade the admin page to use Supabase Auth + service role.
DROP POLICY IF EXISTS "Admin SELECT on security_audit_logs" ON public.security_audit_logs;

CREATE POLICY "Admin only read audit logs"
  ON public.security_audit_logs
  FOR SELECT
  USING (
    (auth.jwt() ->> 'role') = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );


-- ─────────────────────────────────────────────────────────────
--  GRANT statements
--  Supabase grants these by default; included for explicitness.
-- ─────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO anon;

GRANT INSERT          ON public.waitlist              TO anon;
GRANT INSERT          ON public.suggestions           TO anon;
GRANT INSERT          ON public.enquiries             TO anon;
GRANT SELECT          ON public.waitlist              TO anon;
GRANT SELECT, UPDATE  ON public.suggestions           TO anon;
GRANT INSERT          ON public.security_audit_logs   TO anon;
-- No SELECT grant on security_audit_logs for anon — RLS enforces this.
