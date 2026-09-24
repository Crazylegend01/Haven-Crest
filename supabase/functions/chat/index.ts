import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

serve(async (req) => {
  // 1. Handle CORS Preflight (OPTIONS) using status 200 + "ok" body
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  try {
    const { message } = await req.json();

    // 2. Load API Keys (Supports 1 key, 7 keys, or 20 keys)
    const keysString = Deno.env.get('GEMINI_API_KEYS') || '';
    const apiKeys = keysString.split(',').map((k) => k.trim()).filter(Boolean);

    if (apiKeys.length === 0) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEYS secret is missing in Supabase.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const model = Deno.env.get('GEMINI_MODEL') || 'gemini-1.5-flash';
    let replyText = null;

    // 3. Iterate through all 7 keys on failure/rate limit
    for (let i = 0; i < apiKeys.length; i++) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKeys[i]}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: message }] }]
            }),
          }
        );

        if (response.ok) {
          const data = await response.json();
          replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (replyText) break; // Success! Exit key loop
        }
      } catch (err) {
        console.warn(`Key #${i + 1} failed:`, err);
      }
    }

    return new Response(
      JSON.stringify({ reply: replyText || "AI service busy. Please try again shortly." }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
