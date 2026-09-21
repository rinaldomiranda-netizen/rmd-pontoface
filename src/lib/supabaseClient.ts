import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
export const FUNCTIONS_BASE = import.meta.env.VITE_PONTOFACE_FUNCTIONS_BASE as string;
export const AWS_REGION = (import.meta.env.VITE_AWS_REGION as string) || 'sa-east-1';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function callFunction<T = any>(slug: string, body: unknown, extraHeaders?: Record<string, string>): Promise<{ ok: boolean; status: number; data: T }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(extraHeaders || {}) };
  if (sessionData.session?.access_token) headers['Authorization'] = `Bearer ${sessionData.session.access_token}`;
  const r = await fetch(`${FUNCTIONS_BASE}/${slug}`, { method: 'POST', headers, body: JSON.stringify(body || {}) });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}
