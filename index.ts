/**
 * Haven AI — Supabase Edge Function
 *
 * Required Supabase secret:
 *   GEMINI_API_KEYS=key_one,key_two,key_three
 *
 * Keys are tried sequentially. The browser never receives or sees them.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const SYSTEM_PROMPT =
  "You are Haven AI, the official housing assistant for Haven & Crest. " +
  "Help students find safe housing, avoid scams, and understand lease terms. " +
  "Keep responses concise, supportive, accurate, and easy to read. " +
  "Remind users never to pay money before verifying a property in person.";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_MESSAGES = 10;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE_LENGTH);
}

function normaliseHistory(value: unknown): Array<{ role: "user" | "model"; text: string }> {
  if (!Array.isArray(value)) return [];

  return value
    .slice(-MAX_HISTORY_MESSAGES)
    .map((item) => ({
      role: item?.role === "assistant" ? "model" : "user",
      text: cleanText(item?.text),
    }))
    .filter((item) => item.text.length > 0);
}

async function tryGemini(
  apiKey: string,
  contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>,
): Promise<string | null> {
  const model = Deno.env.get("GEMINI_MODEL") || "gemini-1.5-flash";
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}` +
    `:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 500,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  const reply = payload?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || "")
    .join("")
    .trim();

  return reply || null;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const keysString = Deno.env.get("GEMINI_API_KEYS") || "";
  const apiKeys = keysString
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);

  if (apiKeys.length === 0) {
    console.error("[Haven AI] GEMINI_API_KEYS is not configured.");
    return jsonResponse({
      error: "AI service is currently busy. Please try again shortly.",
    }, 503);
  }

  let body: { message?: unknown; history?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request body." }, 400);
  }

  const message = cleanText(body.message);
  if (!message) {
    return jsonResponse({ error: "Please send a housing question." }, 400);
  }

  const history = normaliseHistory(body.history);
  const contents = [
    ...history,
    { role: "user" as const, text: message },
  ].map((item) => ({
    role: item.role,
    parts: [{ text: item.text }],
  }));

  for (let index = 0; index < apiKeys.length; index += 1) {
    try {
      const reply = await tryGemini(apiKeys[index], contents);
      if (reply) return jsonResponse({ reply });
      console.warn(`[Haven AI] Gemini key index ${index} returned no answer; trying next key.`);
    } catch (error) {
      console.warn(
        `[Haven AI] Gemini key index ${index} failed; trying next key.`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return jsonResponse({
    error: "AI service is currently busy. Please try again shortly.",
  }, 503);
});