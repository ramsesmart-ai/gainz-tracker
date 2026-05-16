import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

const USER_ID_KEY = 'kova_user_id';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 10; // 10 years

function readCookie() {
  try {
    const match = document.cookie.split('; ').find(r => r.startsWith(USER_ID_KEY + '='));
    return match ? match.split('=')[1] : null;
  } catch { return null; }
}

function writeCookie(id) {
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${USER_ID_KEY}=${id}; max-age=${COOKIE_MAX_AGE}; SameSite=Strict; path=/${secure}`;
  } catch { /* cookie blocked (private browsing) — silent */ }
}

export function getUserId() {
  let id = null;

  try { id = localStorage.getItem(USER_ID_KEY); } catch { /* localStorage unavailable */ }
  if (!id) id = readCookie();
  if (!id) id = crypto.randomUUID();

  // Write to both so whichever survives a clear can restore the other
  try { localStorage.setItem(USER_ID_KEY, id); } catch { /* quota/private mode */ }
  writeCookie(id);

  return id;
}
