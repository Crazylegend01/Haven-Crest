import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

serve(async (req) => {
  // Always return 200 OK for OPTIONS preflight checks
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { message } = await req.json();
    const keysString = Deno.env.get('GEMINI_API_KEYS') || '';
    const apiKeys = keysString.split(',').map((k) => k.trim()).filter(Boolean);

    if (apiKeys.length === 0) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEYS not set in Supabase Secrets.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const model = Deno.env.get('GEMINI_MODEL') || 'gemini-1.5-flash';
    let replyText = null;

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
          if (replyText) break;
        }
      } catch (err) {
        console.warn(`Key ${i + 1} failed:`, err);
      }
    }

    return new Response(
      JSON.stringify({ reply: replyText || "AI service busy. Try again shortly." }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
