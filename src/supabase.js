import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

export function getUserId() {
  let id = localStorage.getItem('kova_user_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('kova_user_id', id);
  }
  return id;
}
