import React from 'react';
import { supabase, callFunction, friendlyAuthError } from '../lib/supabaseClient';

type Props = {
  onReady: (companyId: string, role: string) => void;
};

export default function AdminAuth({ onReady }: Props) {
  const [mode, setMode] = React.useState<'login' | 'signup' | 'needs_confirmation' | 'needs_company'>('login');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [companyName, setCompanyName] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    checkExistingSession();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) checkMembership();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function checkExistingSession() {
    const { data } = await supabase.auth.getSession();
    if (data.session) checkMembership();
  }

  async function checkMembership() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const { data: membership } = await supabase
      .from('company_users')
      .select('company_id, role')
      .eq('auth_user_id', userData.user.id)
      .maybeSingle();
    if (membership) onReady(membership.company_id, membership.role);
    else setMode('needs_company');
  }

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (err) { setError(friendlyAuthError(err.message)); return; }
    checkMembership();
  }

  async function doSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setBusy(true);
    const { data, error: err } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (err) { setError(friendlyAuthError(err.message)); return; }
    if (!data.session) { setMode('needs_confirmation'); return; }
    setMode('needs_company');
  }

  async function doCreateCompany(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setBusy(true);
    const res = await callFunction<{ company_id?: string; error?: string }>('bootstrap-company', { company_name: companyName.trim() });
    setBusy(false);
    if (!res.ok) {
      if (res.data.error === 'already_has_company' && (res.data as any).company_id) {
        checkMembership();
        return;
      }
      setError('Não foi possível criar a empresa: ' + (res.data.error || 'erro desconhecido'));
      return;
    }
    checkMembership();
  }

  if (mode === 'needs_confirmation') {
    return (
      <div className="admin-auth">
        <div className="card">
          <h1>Confirme seu e-mail</h1>
          <p className="sub">Enviamos um link de confirmação para <b>{email}</b>. Depois de confirmar, volte aqui e entre normalmente.</p>
          <button className="btn green wide" onClick={() => setMode('login')}>Voltar para o login</button>
        </div>
      </div>
    );
  }

  if (mode === 'needs_company') {
    return (
      <div className="admin-auth">
        <div className="card">
          <h1>Criar sua empresa</h1>
          <p className="sub">Sua conta ainda não está vinculada a nenhuma empresa no RMD PontoFace. Crie a empresa para se tornar o administrador dela.</p>
          {error && <div className="error-box">{error}</div>}
          <form onSubmit={doCreateCompany}>
            <div className="field"><label>Nome da empresa</label><input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Ex: RMD Serviços Ltda" required /></div>
            <button className="btn green wide" disabled={busy} type="submit">{busy ? 'Criando...' : 'Criar empresa e continuar'}</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-auth">
      <div className="card">
        <h1>RMD PontoFace</h1>
        <p className="sub">Área administrativa — {mode === 'login' ? 'entre com sua conta' : 'crie sua conta de administrador'}.</p>
        {error && <div className="error-box">{error}</div>}
        <form onSubmit={mode === 'login' ? doLogin : doSignup}>
          <div className="field"><label>E-mail</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
          <div className="field"><label>Senha</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={6} required /></div>
          <button className="btn green wide" disabled={busy} type="submit">{busy ? 'Aguarde...' : (mode === 'login' ? 'Entrar' : 'Criar conta')}</button>
        </form>
        <button className="switch-link" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>
          {mode === 'login' ? 'Ainda não tem conta? Criar conta' : 'Já tem conta? Entrar'}
        </button>
      </div>
    </div>
  );
}
