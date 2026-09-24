/**
 * Haven & Crest server
 *
 * Serves the existing static site and keeps the Gemini API key server-side.
 * Run with: npm start
 */

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const MAX_MESSAGES_PER_SESSION = 10;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_MESSAGES = 12;
const sessions = new Map();

const SYSTEM_PROMPT = [
  'You are Haven AI, the official student housing assistant for Haven & Crest.',
  'You help university students find safe housing, avoid rental scams, understand leasing terms, and guide landlords on creating clear listings.',
  'Keep responses concise, supportive, accurate, and easy to read.',
  'Remind users never to pay money before verifying a property in person.',
  'Do not present legal, financial, or emergency advice as a substitute for a qualified professional or local authority.',
  'If a question depends on local law, say that rules vary by location and recommend checking the relevant tenancy authority or a qualified adviser.',
].join(' ');

app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));

function parseCookies(header = '') {
  return header.split(';').reduce((cookies, part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return cookies;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function getSession(request, response) {
  const cookies = parseCookies(request.headers.cookie);
  let sessionId = cookies.hc_chat_session;
  let session = sessionId && sessions.get(sessionId);

  if (!session || Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessionId = crypto.randomUUID();
    session = { createdAt: Date.now(), count: 0 };
    sessions.set(sessionId, session);
    const secure = request.headers['x-forwarded-proto'] === 'https' || request.secure;
    response.setHeader(
      'Set-Cookie',
      `hc_chat_session=${encodeURIComponent(sessionId)}; Max-Age=86400; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`,
    );
  }

  return session;
}

function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE_LENGTH);
}

function normaliseMessages(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-MAX_HISTORY_MESSAGES)
    .map(message => ({
      role: message?.role === 'assistant' ? 'model' : 'user',
      text: cleanText(message?.text),
    }))
    .filter(message => message.text);
}

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, service: 'haven-ai' });
});

app.post('/api/chat', async (request, response) => {
  const session = getSession(request, response);
  const remaining = Math.max(0, MAX_MESSAGES_PER_SESSION - session.count);

  if (session.count >= MAX_MESSAGES_PER_SESSION) {
    return response.status(429).json({
      error: 'This session has reached the 10-message limit. Please start a new session later.',
      remaining: 0,
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error('[Haven AI] GEMINI_API_KEY is not configured.');
    return response.status(503).json({
      error: 'Haven AI is not configured yet. Please try again later.',
      remaining,
    });
  }

  const messages = normaliseMessages(request.body?.messages);
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'user') {
    return response.status(400).json({
      error: 'Please send a housing question.',
      remaining,
    });
  }

  session.count += 1;

  try {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: messages.map(message => ({
          role: message.role,
          parts: [{ text: message.text }],
        })),
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 500,
        },
      }),
    });

    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error('[Haven AI] Gemini request failed:', upstream.status, payload?.error?.message || 'unknown error');
      return response.status(502).json({
        error: 'Haven AI is temporarily unavailable. Please try again shortly.',
        remaining: Math.max(0, MAX_MESSAGES_PER_SESSION - session.count),
      });
    }

    const reply = payload?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || '')
      .join('')
      .trim();

    if (!reply) {
      return response.status(502).json({
        error: 'Haven AI returned an empty response. Please try again.',
        remaining: Math.max(0, MAX_MESSAGES_PER_SESSION - session.count),
      });
    }

    return response.json({
      reply,
      remaining: Math.max(0, MAX_MESSAGES_PER_SESSION - session.count),
    });
  } catch (error) {
    console.error('[Haven AI] Unexpected error:', error);
    return response.status(502).json({
      error: 'Haven AI is temporarily unavailable. Please try again shortly.',
      remaining: Math.max(0, MAX_MESSAGES_PER_SESSION - session.count),
    });
  }
});

app.use(express.static(ROOT, { index: 'index.html' }));

app.use((error, _request, response, _next) => {
  if (error?.type === 'entity.too.large') {
    return response.status(413).json({ error: 'Request is too large.' });
  }
  console.error('[Haven & Crest] Server error:', error);
  return response.status(500).json({ error: 'Something went wrong.' });
});

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) sessions.delete(id);
  }
}, 60 * 60 * 1000).unref();

app.listen(PORT, () => {
  console.log(`Haven & Crest running on http://localhost:${PORT}`);
});