import React from 'react';
import { supabase, callFunction } from '../lib/supabaseClient';

type Company = {
  id: string; name: string; active: boolean; created_at: string;
  employee_count: number; owner_email: string | null; has_pending_invite: boolean;
};

export default function PlatformAdmin() {
  const [session, setSession] = React.useState<'checking' | 'login' | 'forbidden' | 'ok'>('checking');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [newName, setNewName] = React.useState('');
  const [newTemplate, setNewTemplate] = React.useState('generic');
  const [newEmail, setNewEmail] = React.useState('');
  const [inviteLink, setInviteLink] = React.useState<{ name: string; url: string } | null>(null);

  React.useEffect(() => {
    check();
    const { data: sub } = supabase.auth.onAuthStateChange(() => check());
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function check() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { setSession('login'); return; }
    const res = await callFunction<{ companies?: Company[]; error?: string }>('platform-list-companies', {});
    if (!res.ok) { setSession('forbidden'); return; }
    setCompanies(res.data.companies || []);
    setSession('ok');
  }

  async function doLogin(e: React.FormEvent) {
    e.preventDefault(); setError(''); setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (err) { setError('E-mail ou senha incorretos.'); return; }
  }

  async function createCompany(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const res = await callFunction<{ invite_path?: string; name?: string; error?: string }>('platform-create-company', { name: newName.trim(), template: newTemplate, invited_email: newEmail.trim() || null });
    if (!res.ok || !res.data.invite_path) { alert('Não foi possível criar a empresa.'); return; }
    setInviteLink({ name: res.data.name || newName, url: `${window.location.origin}${res.data.invite_path}` });
    setNewName(''); setNewEmail('');
    check();
  }

  async function toggleActive(id: string, active: boolean) {
    const res = await callFunction('platform-toggle-company', { company_id: id, active: !active });
    if (!res.ok) { alert('Não foi possível alterar o status.'); return; }
    check();
  }

  async function logout() { await supabase.auth.signOut(); }

  if (session === 'checking') return <div className="admin-auth"><div className="card"><h1>Carregando...</h1></div></div>;

  if (session === 'login') {
    return <div className="admin-auth"><div className="card">
      <h1>RMD — Painel da plataforma</h1>
      <p className="sub">Acesso restrito à equipe RMD.</p>
      {error && <div className="error-box">{error}</div>}
      <form onSubmit={doLogin}>
        <div className="field"><label>E-mail</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
        <div className="field"><label>Senha</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
        <button className="btn green wide" disabled={busy} type="submit">{busy ? 'Aguarde...' : 'Entrar'}</button>
      </form>
    </div></div>;
  }

  if (session === 'forbidden') {
    return <div className="admin-auth"><div className="card">
      <h1>Sem acesso</h1>
      <p className="sub">Esta conta não é administradora da plataforma RMD.</p>
      <button className="btn light wide" onClick={logout}>Sair</button>
    </div></div>;
  }

  return (
    <div className="admin">
      <div className="admin-main" style={{ maxWidth: 900, margin: '0 auto' }}>
        <div className="admin-topbar">
          <h1>RMD — Empresas clientes</h1>
          <button className="btn light" onClick={logout}>Sair</button>
        </div>

        <div className="card">
          <h2>Nova empresa cliente</h2>
          <form onSubmit={createCompany}>
            <div className="row2">
              <div className="field"><label>Nome da empresa</label><input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: Igreja Vida Nova" /></div>
              <div className="field"><label>Tipo (define os textos padrão)</label>
                <select value={newTemplate} onChange={e => setNewTemplate(e.target.value)}>
                  <option value="generic">Genérico / RH (Funcionário, Entrada/Saída)</option>
                  <option value="church">Igreja (Membro, Presença no culto)</option>
                  <option value="meeting">Reuniões / Eventos (Participante, Presença)</option>
                </select>
              </div>
            </div>
            <div className="field" style={{ maxWidth: 320 }}><label>E-mail do responsável (opcional, só para referência)</label><input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} /></div>
            <button className="btn green" type="submit">Criar empresa e gerar convite</button>
          </form>
          {inviteLink && (
            <div className="notice" style={{ marginTop: 14 }}>
              <b>{inviteLink.name}</b> criada. Envie este link para o cliente (funciona uma única vez):
              <div className="copylink" style={{ marginTop: 8 }}><span>{inviteLink.url}</span><button className="btn light" onClick={() => navigator.clipboard?.writeText(inviteLink.url)}>Copiar</button></div>
              <a className="btn green" style={{ marginTop: 10, display: 'inline-block', textDecoration: 'none' }} target="_blank" rel="noreferrer"
                href={`https://wa.me/?text=${encodeURIComponent(`Olá! Aqui está o seu acesso ao sistema ${inviteLink.name}: ${inviteLink.url}`)}`}>
                📲 Enviar pelo WhatsApp
              </a>
            </div>
          )}
        </div>

        <div className="card">
          <h2>{companies.length} empresa(s)</h2>
          <table>
            <thead><tr><th>Nome</th><th>Responsável</th><th>Pessoas</th><th>Status</th><th>Convite</th><th></th></tr></thead>
            <tbody>
              {companies.map(c => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.owner_email || <span className="helptext">ainda não vinculado</span>}</td>
                  <td>{c.employee_count}</td>
                  <td><span className={`tag ${c.active ? '' : 'danger'}`}>{c.active ? 'Ativa' : 'Suspensa'}</span></td>
                  <td>{c.has_pending_invite ? <span className="tag warn">Pendente</span> : <span className="tag off">—</span>}</td>
                  <td><button className="btn light" onClick={() => toggleActive(c.id, c.active)}>{c.active ? 'Suspender' : 'Reativar'}</button></td>
                </tr>
              ))}
              {!companies.length && <tr><td colSpan={6} className="empty-row">Nenhuma empresa cadastrada ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
