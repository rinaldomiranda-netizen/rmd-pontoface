import React from 'react';
import { supabase, callFunction } from '../lib/supabaseClient';

export default function ClaimInvite() {
  const token = new URLSearchParams(location.search).get('token') || '';
  const [step, setStep] = React.useState<'login' | 'signup' | 'needs_confirmation' | 'claiming' | 'done' | 'error'>('login');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!token) { setStep('error'); setError('Este link de convite está incompleto.'); return; }
    supabase.auth.getSession().then(({ data }) => { if (data.session) claim(); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { if (session) claim(); });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function claim() {
    setStep('claiming');
    const res = await callFunction<{ company_id?: string; error?: string }>('claim-company-invite', { token });
    if (!res.ok) {
      const msgs: Record<string, string> = {
        invalid_invite: 'Este convite não é válido.',
        invite_already_used: 'Este convite já foi utilizado.',
        invite_expired: 'Este convite expirou. Peça um novo à RMD.'
      };
      setError(msgs[(res.data as any)?.error] || 'Não foi possível aceitar o convite.');
      setStep('error');
      return;
    }
    setStep('done');
    setTimeout(() => { location.href = '/admin'; }, 1500);
  }

  async function doLogin(e: React.FormEvent) {
    e.preventDefault(); setError(''); setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (err) { setError(err.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : err.message); return; }
  }

  async function doSignup(e: React.FormEvent) {
    e.preventDefault(); setError(''); setBusy(true);
    const { data, error: err } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (err) { setError(err.message); return; }
    if (!data.session) { setStep('needs_confirmation'); return; }
  }

  if (step === 'error') {
    return <div className="admin-auth"><div className="card"><h1>Convite indisponível</h1><p className="sub">{error}</p></div></div>;
  }
  if (step === 'claiming') {
    return <div className="admin-auth"><div className="card"><h1>Só um instante...</h1><p className="sub">Estamos vinculando sua conta à empresa.</p></div></div>;
  }
  if (step === 'done') {
    return <div className="admin-auth"><div className="card"><h1>Tudo pronto!</h1><p className="sub">Você já faz parte da empresa. Redirecionando para o painel...</p></div></div>;
  }
  if (step === 'needs_confirmation') {
    return <div className="admin-auth"><div className="card">
      <h1>Confirme seu e-mail</h1>
      <p className="sub">Enviamos um link de confirmação para <b>{email}</b>. Depois de confirmar, volte nesta mesma página e entre normalmente.</p>
      <button className="btn green wide" onClick={() => setStep('login')}>Voltar</button>
    </div></div>;
  }

  return (
    <div className="admin-auth">
      <div className="card">
        <h1>Você foi convidado</h1>
        <p className="sub">Crie sua conta (ou entre, se já tiver uma) para começar a usar o sistema da sua empresa.</p>
        {error && <div className="error-box">{error}</div>}
        <form onSubmit={step === 'signup' ? doSignup : doLogin}>
          <div className="field"><label>E-mail</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
          <div className="field"><label>Senha</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={6} required /></div>
          <button className="btn green wide" disabled={busy} type="submit">{busy ? 'Aguarde...' : (step === 'signup' ? 'Criar conta' : 'Entrar')}</button>
        </form>
        <button className="switch-link" onClick={() => { setStep(step === 'signup' ? 'login' : 'signup'); setError(''); }}>
          {step === 'signup' ? 'Já tem conta? Entrar' : 'Ainda não tem conta? Criar conta'}
        </button>
      </div>
    </div>
  );
}
