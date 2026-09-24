# Haven AI setup

Haven AI uses a Node/Express backend so the Gemini API key never reaches the browser.

## Run locally or on Replit

1. Install dependencies:

   ```bash
   npm install
   ```

2. Add `GEMINI_API_KEY` to Replit Secrets (or your hosting provider's environment variables). Do not put the real key in `.env`, JavaScript, or HTML.

3. Start the site:

   ```bash
   npm start
   ```

The site is served at the same origin as `POST /api/chat`. A health check is available at `GET /api/health`.

## Rate limiting

The backend assigns an HTTP-only session cookie and permits 10 chat messages per session. Session counters are held in memory and expire after 24 hours. This is intentionally lightweight for a single-server deployment; use a shared store such as Supabase or Redis if you later run multiple server instances.

## Existing Supabase project

The existing frontend continues to use the Supabase project in `supabaseClient.js` for waitlist, suggestions, enquiries, and security audit logs. Haven AI does not store chat transcripts in Supabase by default.

The Supabase SQL setup remains in `supabase-setup.sql`. The public browser client uses the anon key as before; the Gemini key is server-only.