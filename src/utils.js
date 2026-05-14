// ── Shared helpers ──────────────────────────────────────

export const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ── Profile ──────────────────────────────────────────────

export const DEFAULT_PROFILE = {
  currentWeight: 172,
  phase: 'refeed',
  goalMin: 0.25,
  goalMax: 0.5,
  trainingTargets: { calories: 2800, protein: 200, carbs: 340, fat: 65 },
  restTargets:     { calories: 2600, protein: 200, carbs: 290, fat: 65 },
};

export const getProfile = () => {
  try {
    const raw = localStorage.getItem('gainz_profile');
    return raw ? { ...DEFAULT_PROFILE, ...JSON.parse(raw) } : { ...DEFAULT_PROFILE };
  } catch { return { ...DEFAULT_PROFILE }; }
};

export const saveProfile = (p) =>
  localStorage.setItem('gainz_profile', JSON.stringify(p));

export const getApiKey = () => localStorage.getItem('gainz_api_key') || '';

// ── JSON parsing from AI ─────────────────────────────────

export const parseJSONFromAI = (text) => {
  const stripped = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  const match = stripped.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  return JSON.parse(match ? match[0] : stripped);
};

// ── API helpers ───────────────────────────────────────────

const AI_HEADERS = (key) => ({
  'Content-Type': 'application/json',
  'x-api-key': key,
  'anthropic-version': '2023-06-01',
  'anthropic-dangerous-direct-browser-access': 'true',
});

export const callAI = async (apiKey, systemPrompt, userContent, maxTokens = 1024) => {
  if (!apiKey) throw new Error('No API key. Add it in Profile settings.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: AI_HEADERS(apiKey),
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${res.status}`);
  }
  const data = await res.json();
  return data.content[0].text;
};

export const streamAIMessages = async (apiKey, systemPrompt, messages, onChunk, maxTokens = 1500) => {
  if (!apiKey) throw new Error('No API key. Add it in Profile settings.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: AI_HEADERS(apiKey),
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      stream: true,
      system: systemPrompt,
      messages,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${res.status}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') break;
      try {
        const evt = JSON.parse(raw);
        if (evt.type === 'content_block_delta' && evt.delta?.text) {
          full += evt.delta.text;
          onChunk(full);
        }
      } catch {}
    }
  }
  return full;
};

export const streamAI = async (apiKey, systemPrompt, userContent, onChunk, maxTokens = 1500) => {
  if (!apiKey) throw new Error('No API key. Add it in Profile settings.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: AI_HEADERS(apiKey),
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      stream: true,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${res.status}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') break;
      try {
        const evt = JSON.parse(raw);
        if (evt.type === 'content_block_delta' && evt.delta?.text) {
          full += evt.delta.text;
          onChunk(full);
        }
      } catch {}
    }
  }
  return full;
};
