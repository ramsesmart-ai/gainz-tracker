import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://pvulqcaqbnkzzlbgsbga.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dWxxY2FxYm5renpsYmdzYmdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MDU5MDgsImV4cCI6MjA5NDM4MTkwOH0.7qR8CNaNZ6rD3nKjkAuNJP17LgsKWK6qulib7FcqdjM'
);

export function getUserId() {
  let id = localStorage.getItem('kova_user_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('kova_user_id', id);
  }
  return id;
}
