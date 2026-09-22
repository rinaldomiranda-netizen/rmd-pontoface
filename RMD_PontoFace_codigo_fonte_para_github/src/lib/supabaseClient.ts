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

const ERROR_MESSAGES_PT: Record<string, string> = {
  unauthorized: 'Sua sessão expirou. Saia e entre novamente.',
  forbidden: 'Você não tem permissão para fazer essa ação.',
  insufficient_role: 'Seu perfil de acesso não permite essa ação.',
  invalid_table: 'Ação inválida.',
  invalid_action: 'Ação inválida.',
  invalid_request: 'Requisição inválida.',
  invalid_json: 'Erro ao enviar os dados. Tente novamente.',
  company_id_required: 'Empresa não identificada. Recarregue a página.',
  id_required: 'Registro não identificado.',
  employee_not_found: 'Funcionário não encontrado ou inativo.',
  employee_not_found_or_inactive: 'Funcionário não encontrado ou inativo.',
  facial_profile_not_enrolled: 'O rosto deste funcionário ainda não foi cadastrado.',
  facial_reference_not_ready: 'O cadastro facial deste funcionário ainda não está pronto.',
  invalid_descriptor: 'Não foi possível processar o rosto na foto. Tente novamente.',
  access_denied: 'Acesso negado. Peça um novo link ao administrador.',
  db_error: 'Não foi possível salvar. Verifique os dados e tente novamente.',
  aws_credentials_not_configured: 'O reconhecimento facial ainda não foi configurado pelo administrador do sistema.',
  reference_must_contain_exactly_one_face: 'A foto precisa mostrar exatamente um rosto, bem enquadrado.',
  reference_image_quality_insufficient: 'A qualidade da foto está baixa. Tente novamente com mais luz.',
  already_has_company: 'Esta conta já está vinculada a uma empresa.',
  missing_authorization: 'Sua sessão expirou. Saia e entre novamente.',
  missing_company_name: 'Informe o nome da empresa.'
};
export function friendlyError(code?: string): string {
  if (!code) return 'Não foi possível concluir a ação. Tente novamente.';
  return ERROR_MESSAGES_PT[code] || 'Não foi possível concluir a ação. Tente novamente.';
}

const AUTH_ERRORS_PT: { match: string; pt: string }[] = [
  { match: 'Invalid login credentials', pt: 'E-mail ou senha incorretos.' },
  { match: 'Email not confirmed', pt: 'Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada.' },
  { match: 'User already registered', pt: 'Este e-mail já está cadastrado. Tente entrar em vez de criar conta.' },
  { match: 'Password should be at least', pt: 'A senha precisa ter pelo menos 6 caracteres.' },
  { match: 'Unable to validate email address', pt: 'Digite um e-mail válido.' },
  { match: 'rate limit', pt: 'Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.' }
];
export function friendlyAuthError(message?: string): string {
  if (!message) return 'Não foi possível concluir. Tente novamente.';
  const found = AUTH_ERRORS_PT.find(e => message.toLowerCase().includes(e.match.toLowerCase()));
  return found ? found.pt : 'Não foi possível concluir. Tente novamente.';
}
