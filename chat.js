/**
 * Haven AI Housing Assistant
 *
 * The Gemini API is never called from the browser. This module invokes
 * the Supabase Edge Function, which keeps API keys server-side and handles
 * Gemini key rotation/failover.
 */

import { supabase } from './supabaseClient.js?v=5';

const MAX_MESSAGES_PER_SESSION = 10;

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('haven-ai');
  const trigger = document.getElementById('haven-ai-trigger');
  const panel = document.getElementById('haven-ai-panel');
  const close = document.getElementById('haven-ai-close');
  const form = document.getElementById('haven-ai-form');
  const input = document.getElementById('haven-ai-input');
  const send = document.getElementById('haven-ai-send');
  const messagesEl = document.getElementById('haven-ai-messages');
  const limitEl = document.getElementById('haven-ai-limit');

  if (!root || !trigger || !panel || !close || !form || !input || !send || !messagesEl) return;

  const conversation = [];
  let sentCount = 0;
  let isBusy = false;

  function setOpen(open) {
    panel.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    trigger.setAttribute('aria-label', open ? 'Close Haven AI housing guide' : 'Open Haven AI housing guide');
    if (open) window.requestAnimationFrame(() => input.focus());
  }

  function scrollToLatest() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendMessage(role, text) {
    const bubble = document.createElement('div');
    bubble.className = `haven-ai__message haven-ai__message--${role}`;
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    bubble.appendChild(paragraph);
    messagesEl.appendChild(bubble);
    scrollToLatest();
  }

  function setTyping(show) {
    const existing = document.getElementById('haven-ai-typing');
    if (!show) {
      existing?.remove();
      return;
    }
    if (existing) return;
    const typing = document.createElement('div');
    typing.className = 'haven-ai__message haven-ai__message--assistant haven-ai__typing';
    typing.id = 'haven-ai-typing';
    typing.setAttribute('aria-label', 'Haven AI is typing');
    typing.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(typing);
    scrollToLatest();
  }

  function updateLimit(remaining) {
    const count = Number.isFinite(remaining) ? remaining : Math.max(0, MAX_MESSAGES_PER_SESSION - sentCount);
    limitEl.textContent = count === 0 ? 'Session limit reached' : `${count} message${count === 1 ? '' : 's'} remaining this session`;
    input.disabled = count === 0;
    send.disabled = count === 0 || isBusy;
  }

  function setBusy(busy) {
    isBusy = busy;
    input.disabled = busy || sentCount >= MAX_MESSAGES_PER_SESSION;
    send.disabled = busy || sentCount >= MAX_MESSAGES_PER_SESSION;
  }

  trigger.addEventListener('click', () => setOpen(panel.hidden));
  close.addEventListener('click', () => {
    setOpen(false);
    trigger.focus();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) {
      setOpen(false);
      trigger.focus();
    }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || isBusy || sentCount >= MAX_MESSAGES_PER_SESSION) return;

    appendMessage('user', text);
    conversation.push({ role: 'user', text });
    input.value = '';
    sentCount += 1;
    setBusy(true);
    setTyping(true);

    try {
      const { data, error } = await supabase.functions.invoke('chat', {
        body: {
          message: text,
          history: conversation.slice(-11, -1),
        },
      });
      if (error) throw error;

      const reply = typeof data.reply === 'string' && data.reply.trim()
        ? data.reply.trim()
        : 'I could not generate a response just now. Please try again.';
      conversation.push({ role: 'assistant', text: reply });
      setTyping(false);
      appendMessage('assistant', reply);
    } catch (error) {
      setTyping(false);
      appendMessage(
        'assistant',
        'I’m having trouble connecting right now. Please try again in a moment.',
      );
      console.error('[Haven AI] Chat error:', error);
    } finally {
      setBusy(false);
      if (sentCount < MAX_MESSAGES_PER_SESSION) input.focus();
      updateLimit(typeof sentCount === 'number' ? Math.max(0, MAX_MESSAGES_PER_SESSION - sentCount) : undefined);
    }
  });

  updateLimit(MAX_MESSAGES_PER_SESSION);
});