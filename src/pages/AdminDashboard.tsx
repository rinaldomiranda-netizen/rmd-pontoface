import React from 'react';
import { supabase, callFunction } from '../lib/supabaseClient';

type Props = { companyId: string; role: string; onLogout: () => void };

type Section = 'overview' | 'employees' | 'attendance' | 'locations' | 'access' | 'company' | 'audit';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'overview', label: 'Dashboard' },
  { id: 'employees', label: 'Funcionários' },
  { id: 'attendance', label: 'Controle de Ponto' },
  { id: 'locations', label: 'Localizações' },
  { id: 'access', label: 'Acessos' },
  { id: 'company', label: 'Empresa' },
  { id: 'audit', label: 'Auditoria' },
];

export default function AdminDashboard({ companyId, role, onLogout }: Props) {
  const [section, setSection] = React.useState<Section>('overview');

  const nav = (
    <>
      {SECTIONS.map(s => (
        <button key={s.id} className={section === s.id ? 'active' : ''} onClick={() => setSection(s.id)}>{s.label}</button>
      ))}
    </>
  );

  return (
    <div className="admin">
      <div className="admin-shell">
        <nav className="admin-nav">
          <div className="brand">RMD <span>PontoFace</span></div>
          {nav}
          <button className="logout" onClick={onLogout}>Sair</button>
        </nav>
        <main className="admin-main">
          <div className="admin-topbar">
            <h1>{SECTIONS.find(s => s.id === section)?.label}</h1>
            <button className="btn light" onClick={onLogout}>Sair</button>
          </div>
          <div className="mobile-nav">{nav}</div>
          {section === 'overview' && <Overview companyId={companyId} />}
          {section === 'employees' && <Employees companyId={companyId} role={role} />}
          {section === 'attendance' && <Attendance companyId={companyId} />}
          {section === 'locations' && <Locations companyId={companyId} />}
          {section === 'access' && <Access companyId={companyId} />}
          {section === 'company' && <CompanySettings companyId={companyId} role={role} />}
          {section === 'audit' && <Audit companyId={companyId} />}
        </main>
      </div>
    </div>
  );
}

/* ---------------------------- Overview ---------------------------- */
function Overview({ companyId }: { companyId: string }) {
  const [stats, setStats] = React.useState({ total: 0, working: 0, out: 0, pending: 0, occurrences: 0 });
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => { load(); }, [companyId]);

  async function load() {
    setLoading(true);
    const { count: total } = await supabase.from('employees').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('active', true);
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const { data: todays } = await supabase.from('attendance_records').select('employee_id,punch_type,occurred_at').eq('company_id', companyId).gte('occurred_at', startOfDay.toISOString()).order('occurred_at', { ascending: false });
    const lastByEmployee = new Map<string, string>();
    (todays || []).forEach(r => { if (!lastByEmployee.has(r.employee_id)) lastByEmployee.set(r.employee_id, r.punch_type); });
    const working = [...lastByEmployee.values()].filter(v => v === 'entry').length;
    const { count: pending } = await supabase.from('attendance_records').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('sync_status', 'pending');
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count: occurrences } = await supabase.from('attendance_attempts').select('id', { count: 'exact', head: true }).eq('company_id', companyId).neq('result', 'success').gte('attempted_at', since);
    setStats({ total: total || 0, working, out: Math.max(0, (total || 0) - working), pending: pending || 0, occurrences: occurrences || 0 });
    setLoading(false);
  }

  if (loading) return <p className="empty-row">Carregando...</p>;
  return (
    <div className="kpis">
      <div className="kpi"><small>Total de funcionários</small><b>{stats.total}</b></div>
      <div className="kpi"><small>Trabalhando</small><b>{stats.working}</b></div>
      <div className="kpi"><small>Fora</small><b>{stats.out}</b></div>
      <div className="kpi"><small>Pendentes offline</small><b>{stats.pending}</b></div>
      <div className="kpi"><small>Ocorrências (24h)</small><b>{stats.occurrences}</b></div>
    </div>
  );
}

/* ---------------------------- Employees ---------------------------- */
function Employees({ companyId, role }: { companyId: string; role: string }) {
  const [list, setList] = React.useState<any[]>([]);
  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState({ full_name: '', registration_code: '', job_title: '', department: '', document_last4: '' });
  const [error, setError] = React.useState('');
  const [linkFor, setLinkFor] = React.useState<{ id: string; name: string; url: string } | null>(null);
  const [enrollFor, setEnrollFor] = React.useState<{ id: string; name: string } | null>(null);
  const canManage = ['owner', 'admin', 'hr'].includes(role);

  React.useEffect(() => { load(); }, [companyId]);
  async function load() {
    const { data } = await supabase.from('employees').select('id,full_name,registration_code,job_title,department,active,facial_status').eq('company_id', companyId).order('full_name');
    setList(data || []);
  }

  async function createEmployee(e: React.FormEvent) {
    e.preventDefault(); setError('');
    if (!form.full_name.trim() || !form.registration_code.trim()) { setError('Nome e matrícula são obrigatórios.'); return; }
    const { error: err } = await supabase.from('employees').insert({
      company_id: companyId, full_name: form.full_name.trim(), registration_code: form.registration_code.trim(),
      job_title: form.job_title.trim() || null, department: form.department.trim() || null,
      document_last4: form.document_last4.trim() || null
    });
    if (err) { setError(err.message); return; }
    setForm({ full_name: '', registration_code: '', job_title: '', department: '', document_last4: '' });
    setShowForm(false);
    load();
  }

  async function toggleActive(id: string, active: boolean) {
    await supabase.from('employees').update({ active: !active, updated_at: new Date().toISOString() }).eq('id', id);
    load();
  }

  async function generateLink(id: string, name: string) {
    const res = await callFunction<{ path?: string; error?: string }>('generate-employee-access', { employee_id: id });
    if (!res.ok || !res.data.path) { alert('Erro ao gerar acesso: ' + (res.data.error || 'desconhecido')); return; }
    setLinkFor({ id, name, url: `${window.location.origin}${res.data.path}` });
  }

  return (
    <div>
      {canManage && <div className="card">
        <h2>{showForm ? 'Novo funcionário' : `${list.length} funcionário(s)`}</h2>
        {!showForm && <button className="btn green" onClick={() => setShowForm(true)}>+ Novo funcionário</button>}
        {showForm && (
          <form onSubmit={createEmployee}>
            {error && <div className="error-box">{error}</div>}
            <div className="row2">
              <div className="field"><label>Nome completo</label><input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required /></div>
              <div className="field"><label>Matrícula</label><input value={form.registration_code} onChange={e => setForm({ ...form, registration_code: e.target.value })} required /></div>
            </div>
            <div className="row2">
              <div className="field"><label>Cargo</label><input value={form.job_title} onChange={e => setForm({ ...form, job_title: e.target.value })} /></div>
              <div className="field"><label>Departamento</label><input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} /></div>
            </div>
            <div className="field" style={{ maxWidth: 180 }}><label>Últimos 4 dígitos do documento</label><input value={form.document_last4} onChange={e => setForm({ ...form, document_last4: e.target.value })} maxLength={4} /></div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn light" onClick={() => setShowForm(false)}>Cancelar</button>
              <button type="submit" className="btn green">Salvar</button>
            </div>
          </form>
        )}
      </div>}

      <div className="card">
        <table>
          <thead><tr><th>Nome</th><th>Matrícula</th><th>Cargo</th><th>Rosto</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {list.map(e => (
              <tr key={e.id}>
                <td>{e.full_name}</td>
                <td>{e.registration_code}</td>
                <td>{e.job_title || '-'}</td>
                <td><span className={`tag ${e.facial_status === 'enrolled' ? '' : 'warn'}`}>{e.facial_status === 'enrolled' ? 'Cadastrado' : 'Pendente'}</span></td>
                <td><span className={`tag ${e.active ? '' : 'off'}`}>{e.active ? 'Ativo' : 'Inativo'}</span></td>
                <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {canManage && <button className="btn light" onClick={() => generateLink(e.id, e.full_name)}>Gerar link</button>}
                  {canManage && <button className="btn light" onClick={() => setEnrollFor({ id: e.id, name: e.full_name })}>Cadastrar rosto</button>}
                  {canManage && <button className="btn light" onClick={() => toggleActive(e.id, e.active)}>{e.active ? 'Desativar' : 'Ativar'}</button>}
                </td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={6} className="empty-row">Nenhum funcionário cadastrado ainda.</td></tr>}
          </tbody>
        </table>
      </div>

      {linkFor && (
        <div className="card">
          <h2>Link individual — {linkFor.name}</h2>
          <p className="helptext">Envie este link ao funcionário. Ele é pessoal e pode ser revogado a qualquer momento em "Acessos".</p>
          <div className="copylink"><span>{linkFor.url}</span><button className="btn light" onClick={() => { navigator.clipboard?.writeText(linkFor.url); }}>Copiar</button></div>
          <button className="btn light" style={{ marginTop: 10 }} onClick={() => setLinkFor(null)}>Fechar</button>
        </div>
      )}

      {enrollFor && <FaceEnroll companyId={companyId} employeeId={enrollFor.id} employeeName={enrollFor.name} onDone={() => { setEnrollFor(null); load(); }} onCancel={() => setEnrollFor(null)} />}
    </div>
  );
}

function FaceEnroll({ companyId, employeeId, employeeName, onDone, onCancel }: { companyId: string; employeeId: string; employeeName: string; onDone: () => void; onCancel: () => void }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [streaming, setStreaming] = React.useState(false);
  const [captured, setCaptured] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } }).then(s => {
      stream = s;
      if (videoRef.current) { videoRef.current.srcObject = s; setStreaming(true); }
    }).catch(() => setStatus('Não foi possível acessar a câmera. Verifique as permissões do navegador.'));
    return () => { stream?.getTracks().forEach(t => t.stop()); };
  }, []);

  function capture() {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current, c = canvasRef.current;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    setCaptured(c.toDataURL('image/jpeg', 0.92));
  }

  async function confirm() {
    if (!captured || !canvasRef.current) return;
    setBusy(true); setStatus('Enviando foto de referência...');
    const blob = await (await fetch(captured)).blob();
    const path = `${employeeId}/reference.jpg`;
    const { error: upErr } = await supabase.storage.from('facial-references').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
    if (upErr) { setStatus('Erro ao enviar a foto: ' + upErr.message); setBusy(false); return; }
    setStatus('Validando qualidade da imagem...');
    const res = await callFunction<{ ok?: boolean; error?: string }>('enroll-employee-face', { company_id: companyId, employee_id: employeeId, reference_image_path: path });
    setBusy(false);
    if (!res.ok) {
      const msg: Record<string, string> = {
        aws_credentials_not_configured: 'O motor biométrico ainda não foi configurado (credenciais AWS pendentes).',
        reference_must_contain_exactly_one_face: 'A foto precisa mostrar exatamente um rosto, bem enquadrado.',
        reference_image_quality_insufficient: 'A qualidade da foto está baixa. Tente novamente com mais luz e o rosto centralizado.'
      };
      setStatus(msg[res.data.error || ''] || ('Erro: ' + (res.data.error || 'desconhecido')));
      return;
    }
    onDone();
  }

  return (
    <div className="card">
      <h2>Cadastro facial — {employeeName}</h2>
      <div className="camerabox">
        {!captured && <video ref={videoRef} autoPlay playsInline muted />}
        {captured && <img src={captured} alt="Foto capturada" />}
      </div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      {status && <p className="helptext" style={{ marginTop: 8 }}>{status}</p>}
      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        {!captured && <button className="btn green" disabled={!streaming} onClick={capture}>Capturar foto</button>}
        {captured && <button className="btn light" onClick={() => setCaptured(null)}>Tirar novamente</button>}
        {captured && <button className="btn green" disabled={busy} onClick={confirm}>{busy ? 'Enviando...' : 'Confirmar cadastro'}</button>}
        <button className="btn light" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

/* ---------------------------- Attendance ---------------------------- */
function Attendance({ companyId }: { companyId: string }) {
  const [rows, setRows] = React.useState<any[]>([]);
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));

  React.useEffect(() => { load(); }, [companyId, date]);
  async function load() {
    const start = new Date(date + 'T00:00:00'); const end = new Date(date + 'T23:59:59.999');
    const { data } = await supabase.from('attendance_records')
      .select('id,punch_type,occurred_at,identification_method,latitude,longitude,location_accuracy_m,liveness_confidence,face_match_confidence,offline,employees(full_name)')
      .eq('company_id', companyId).gte('occurred_at', start.toISOString()).lte('occurred_at', end.toISOString())
      .order('occurred_at', { ascending: false });
    setRows(data || []);
  }

  function exportCsv() {
    const header = 'Funcionario,Tipo,Horario,Metodo,Latitude,Longitude,Precisao(m),Offline\n';
    const body = rows.map((r: any) => [r.employees?.full_name || '', r.punch_type, r.occurred_at, r.identification_method, r.latitude ?? '', r.longitude ?? '', r.location_accuracy_m ?? '', r.offline ? 'sim' : 'nao'].join(',')).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `ponto-${date}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="field" style={{ margin: 0 }}><label>Data</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        <button className="btn light" onClick={exportCsv}>Exportar CSV</button>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Funcionário</th><th>Tipo</th><th>Horário</th><th>Método</th><th>Localização</th><th>Biometria</th></tr></thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id}>
                <td>{r.employees?.full_name || '-'}</td>
                <td><span className="tag">{r.punch_type === 'entry' ? 'Entrada' : 'Saída'}</span></td>
                <td>{new Date(r.occurred_at).toLocaleTimeString('pt-BR')}</td>
                <td>{r.identification_method}{r.offline ? ' (offline)' : ''}</td>
                <td>{r.latitude != null ? `${r.latitude.toFixed(5)}, ${r.longitude.toFixed(5)} (±${Math.round(r.location_accuracy_m || 0)}m)` : '—'}</td>
                <td>{r.face_match_confidence != null ? `${Number(r.face_match_confidence).toFixed(1)}%` : '—'}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="empty-row">Nenhum registro nesta data.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------------------- Locations ---------------------------- */
function Locations({ companyId }: { companyId: string }) {
  const [list, setList] = React.useState<any[]>([]);
  const [form, setForm] = React.useState({ name: '', address: '', radius_m: '150' });

  React.useEffect(() => { load(); }, [companyId]);
  async function load() {
    const { data } = await supabase.from('work_locations').select('id,name,address,radius_m,active').eq('company_id', companyId).order('name');
    setList(data || []);
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    await supabase.from('work_locations').insert({ company_id: companyId, name: form.name.trim(), address: form.address.trim() || null, radius_m: Number(form.radius_m) || null });
    setForm({ name: '', address: '', radius_m: '150' }); load();
  }
  async function toggle(id: string, active: boolean) {
    await supabase.from('work_locations').update({ active: !active }).eq('id', id); load();
  }

  return (
    <div>
      <div className="card">
        <h2>Nova localização</h2>
        <form onSubmit={add}>
          <div className="row3">
            <div className="field"><label>Nome</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Matriz" /></div>
            <div className="field"><label>Endereço</label><input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
            <div className="field"><label>Raio (m)</label><input value={form.radius_m} onChange={e => setForm({ ...form, radius_m: e.target.value })} /></div>
          </div>
          <button className="btn green" type="submit">Adicionar</button>
        </form>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Nome</th><th>Endereço</th><th>Raio</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {list.map(l => (
              <tr key={l.id}>
                <td>{l.name}</td><td>{l.address || '-'}</td><td>{l.radius_m ? `${l.radius_m}m` : '-'}</td>
                <td><span className={`tag ${l.active ? '' : 'off'}`}>{l.active ? 'Ativa' : 'Inativa'}</span></td>
                <td><button className="btn light" onClick={() => toggle(l.id, l.active)}>{l.active ? 'Desativar' : 'Ativar'}</button></td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={5} className="empty-row">Nenhuma localização cadastrada.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------------------- Access ---------------------------- */
function Access({ companyId }: { companyId: string }) {
  const [list, setList] = React.useState<any[]>([]);
  React.useEffect(() => { load(); }, [companyId]);
  async function load() {
    const { data } = await supabase.from('employee_access').select('id,active,issued_at,revoked_at,last_access_at,employees!inner(id,full_name,company_id)').eq('employees.company_id', companyId).order('issued_at', { ascending: false });
    setList(data || []);
  }
  async function revoke(id: string) {
    await supabase.from('employee_access').update({ active: false, revoked_at: new Date().toISOString() }).eq('id', id);
    load();
  }
  return (
    <div className="card">
      <table>
        <thead><tr><th>Funcionário</th><th>Emitido em</th><th>Último acesso</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {list.map((a: any) => (
            <tr key={a.id}>
              <td>{a.employees?.full_name}</td>
              <td>{new Date(a.issued_at).toLocaleString('pt-BR')}</td>
              <td>{a.last_access_at ? new Date(a.last_access_at).toLocaleString('pt-BR') : '—'}</td>
              <td><span className={`tag ${a.active ? '' : 'off'}`}>{a.active ? 'Ativo' : 'Revogado'}</span></td>
              <td>{a.active && <button className="btn danger" onClick={() => revoke(a.id)}>Revogar</button>}</td>
            </tr>
          ))}
          {!list.length && <tr><td colSpan={5} className="empty-row">Nenhum acesso gerado ainda.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------- Company ---------------------------- */
function CompanySettings({ companyId, role }: { companyId: string; role: string }) {
  const [company, setCompany] = React.useState<any>(null);
  const [saved, setSaved] = React.useState(false);
  const canEdit = ['owner', 'admin'].includes(role);

  React.useEffect(() => { load(); }, [companyId]);
  async function load() {
    const { data } = await supabase.from('companies').select('*').eq('id', companyId).single();
    setCompany(data);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from('companies').update({
      name: company.name, legal_name: company.legal_name, tax_id: company.tax_id, phone: company.phone,
      biometric_liveness_threshold: company.biometric_liveness_threshold, biometric_face_match_threshold: company.biometric_face_match_threshold,
      biometric_enabled: company.biometric_enabled, updated_at: new Date().toISOString()
    }).eq('id', companyId);
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
  }
  if (!company) return <p className="empty-row">Carregando...</p>;
  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <form onSubmit={save}>
        <div className="field"><label>Nome</label><input value={company.name || ''} onChange={e => setCompany({ ...company, name: e.target.value })} disabled={!canEdit} /></div>
        <div className="field"><label>Razão social</label><input value={company.legal_name || ''} onChange={e => setCompany({ ...company, legal_name: e.target.value })} disabled={!canEdit} /></div>
        <div className="row2">
          <div className="field"><label>CNPJ</label><input value={company.tax_id || ''} onChange={e => setCompany({ ...company, tax_id: e.target.value })} disabled={!canEdit} /></div>
          <div className="field"><label>Telefone</label><input value={company.phone || ''} onChange={e => setCompany({ ...company, phone: e.target.value })} disabled={!canEdit} /></div>
        </div>
        <div className="row2">
          <div className="field"><label>Limite de vivacidade (%)</label><input type="number" value={company.biometric_liveness_threshold} onChange={e => setCompany({ ...company, biometric_liveness_threshold: Number(e.target.value) })} disabled={!canEdit} /></div>
          <div className="field"><label>Limite de correspondência facial (%)</label><input type="number" value={company.biometric_face_match_threshold} onChange={e => setCompany({ ...company, biometric_face_match_threshold: Number(e.target.value) })} disabled={!canEdit} /></div>
        </div>
        {canEdit && <button className="btn green" type="submit">Salvar</button>}
        {saved && <span className="helptext" style={{ marginLeft: 10 }}>Salvo!</span>}
      </form>
    </div>
  );
}

/* ---------------------------- Audit ---------------------------- */
function Audit({ companyId }: { companyId: string }) {
  const [list, setList] = React.useState<any[]>([]);
  React.useEffect(() => {
    supabase.from('audit_logs').select('id,action,entity_type,severity,metadata,created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(200).then(({ data }) => setList(data || []));
  }, [companyId]);
  return (
    <div className="card">
      <table>
        <thead><tr><th>Quando</th><th>Ação</th><th>Entidade</th><th>Severidade</th></tr></thead>
        <tbody>
          {list.map(l => (
            <tr key={l.id}>
              <td>{new Date(l.created_at).toLocaleString('pt-BR')}</td>
              <td>{l.action}</td>
              <td>{l.entity_type || '-'}</td>
              <td><span className={`tag ${l.severity === 'error' ? 'danger' : l.severity === 'warning' ? 'warn' : ''}`}>{l.severity}</span></td>
            </tr>
          ))}
          {!list.length && <tr><td colSpan={4} className="empty-row">Nenhum evento de auditoria ainda.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
