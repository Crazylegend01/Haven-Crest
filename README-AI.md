# Haven AI — Supabase Edge Function setup

Haven AI now uses a Supabase Edge Function instead of a custom Node server. The Gemini keys remain server-side in Supabase secrets, and the function tries multiple keys sequentially when a key is rate-limited, invalid, or Gemini is temporarily unavailable.

## 1. Add the function

The deployable function is:

```text
supabase/functions/chat/index.ts
```

From the project root, with the Supabase CLI linked to the Haven & Crest project:

```bash
supabase functions deploy chat
```

## 2. Add Gemini secrets

Store a comma-separated list of Gemini API keys as a Supabase secret. Never put these keys in HTML, browser JavaScript, or the public repository.

```bash
supabase secrets set GEMINI_API_KEYS="key_one,key_two,key_three"
```

Optional model override:

```bash
supabase secrets set GEMINI_MODEL="gemini-1.5-flash"
```

The function defaults to `gemini-1.5-flash` when `GEMINI_MODEL` is not set.

## 3. Frontend connection

`chat.js` imports the existing Supabase client and calls:

```javascript
supabase.functions.invoke('chat', {
  body: { message, history }
});
```

The frontend already has the Supabase URL and anon key in `supabaseClient.js`. The anon key is allowed in browser code; the Gemini keys are not.

## Notes

- CORS and `OPTIONS` preflight handling are included.
- Gemini failures automatically advance to the next configured key.
- If every key fails, the function returns a clean HTTP 503 response.
- The widget keeps the existing 10-message-per-browser-session limit.
- Chat transcripts are not stored in Supabase by this function.