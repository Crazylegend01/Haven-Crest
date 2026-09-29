/**
 * Haven AI Housing Assistant
 *
 * The browser calls the Supabase Edge Function through the official
 * Supabase client. Gemini API keys remain inside Supabase Secrets.
 */

import { supabase } from './supabaseClient.js?v=6';

const MAX_MESSAGES_PER_SESSION = 10;

document.addEventListener('DOMContentLoaded', () => {
  const trigger = document.getElementById('haven-ai-trigger');
  const panel = document.getElementById('haven-ai-panel');
  const closeButton = document.getElementById('haven-ai-close');
  const form = document.getElementById('haven-ai-form');
  const input = document.getElementById('haven-ai-input');
  const sendButton = document.getElementById('haven-ai-send');
  const messages = document.getElementById('haven-ai-messages');
  const limitText = document.getElementById('haven-ai-limit');

  if (!trigger || !panel || !closeButton || !form || !input || !sendButton || !messages || !limitText) {
    return;
  }

  const conversation = [];
  let sentCount = 0;
  let isBusy = false;
  let closeTimer = null;

  function openChat() {
    window.clearTimeout(closeTimer);
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    window.requestAnimationFrame(() => panel.classList.add('is-open'));
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-label', 'Close Haven AI housing guide');
    window.requestAnimationFrame(() => input.focus());
  }

  function closeChat() {
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', 'Open Haven AI housing guide');
    closeTimer = window.setTimeout(() => {
      if (!panel.classList.contains('is-open')) panel.hidden = true;
    }, 190);
    trigger.focus();
  }

  function toggleChat() {
    if (panel.classList.contains('is-open')) closeChat();
    else openChat();
  }

  function scrollToLatest() {
    messages.scrollTop = messages.scrollHeight;
  }

  function appendMessage(role, text) {
    const bubble = document.createElement('div');
    bubble.className = `haven-ai__message haven-ai__message--${role}`;
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    bubble.appendChild(paragraph);
    messages.appendChild(bubble);
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
    typing.id = 'haven-ai-typing';
    typing.className = 'haven-ai__message haven-ai__message--assistant haven-ai__typing';
    typing.setAttribute('aria-label', 'Haven AI is typing');
    typing.innerHTML = '<span></span><span></span><span></span>';
    messages.appendChild(typing);
    scrollToLatest();
  }

  function updateLimit() {
    const remaining = Math.max(0, MAX_MESSAGES_PER_SESSION - sentCount);
    limitText.textContent = remaining === 0
      ? 'Session limit reached'
      : `${remaining} message${remaining === 1 ? '' : 's'} remaining this session`;
    input.disabled = isBusy || remaining === 0;
    sendButton.disabled = isBusy || remaining === 0;
  }

  async function requestAssistant(message, history) {
    try {
      const { data, error } = await supabase.functions.invoke('chat', {
        body: { message, history },
      });

      if (error) throw error;
      if (!data || typeof data.reply !== 'string' || !data.reply.trim()) {
        throw new Error('The chat function returned an empty response.');
      }

      return data.reply.trim();
    } catch (error) {
      console.error('[Haven AI] Supabase Edge Function error:', error);
      throw error;
    }
  }

  trigger.addEventListener('click', toggleChat);
  closeButton.addEventListener('click', closeChat);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && panel.classList.contains('is-open')) {
      closeChat();
    }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const text = input.value.trim();

    if (!text || isBusy || sentCount >= MAX_MESSAGES_PER_SESSION) return;

    // Send only previous turns as history; the current message is sent separately.
    const history = conversation.slice(-10);
    conversation.push({ role: 'user', text });
    input.value = '';
    sentCount += 1;
    isBusy = true;
    updateLimit();
    appendMessage('user', text);
    setTyping(true);

    try {
      const reply = await requestAssistant(text, history);
      conversation.push({ role: 'assistant', text: reply });
      setTyping(false);
      appendMessage('assistant', reply);
    } catch {
      setTyping(false);
      appendMessage(
        'assistant',
        'I’m having trouble connecting right now. Please try again in a moment.',
      );
    } finally {
      isBusy = false;
      updateLimit();
      if (sentCount < MAX_MESSAGES_PER_SESSION) input.focus();
    }
  });

  // The panel is intentionally collapsed on first load.
  panel.hidden = true;
  panel.setAttribute('aria-hidden', 'true');
  trigger.setAttribute('aria-expanded', 'false');
  updateLimit();
});