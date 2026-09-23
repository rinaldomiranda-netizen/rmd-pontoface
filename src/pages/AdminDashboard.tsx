import React from 'react';
import { supabase, callFunction, friendlyError } from '../lib/supabaseClient';
import { loadFaceModels, detectFace } from '../lib/faceEngine';
import { parseCsv, normalizeImportRow } from '../lib/csv';
import { usePwaInstall } from '../lib/pwaInstall';
import JSZip from 'jszip';

const ToastContext = React.createContext<(msg: string) => void>(() => {});
function useToast() { return React.useContext(ToastContext); }

type Props = { companyId: string; role: string; onLogout: () => void };

type Section = 'overview' | 'employees' | 'attendance' | 'locations' | 'access' | 'import' | 'company' | 'audit';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'overview', label: 'Dashboard' },
  { id: 'employees', label: 'Pessoas' },
  { id: 'attendance', label: 'Controle de Presença' },
  { id: 'locations', label: 'Localizações' },
  { id: 'access', label: 'Acessos' },
  { id: 'import', label: 'Importar' },
  { id: 'company', label: 'Empresa' },
  { id: 'audit', label: 'Auditoria' },
];

export default function AdminDashboard({ companyId, role, onLogout }: Props) {
  const [section, setSection] = React.useState<Section>('overview');
  const [labels, setLabels] = React.useState({ person_label: 'Funcionário', people_label: 'Funcionários', entry_label: 'Bater entrada', exit_label: 'Bater saída', exit_enabled: true, name: 'RMD PontoFace' });
  const pwa = usePwaInstall('/admin');
  const [toastMsg, setToastMsg] = React.useState<string | null>(null);
  const toastTimer = React.useRef<number | null>(null);
  function showToast(msg: string) {
    setToastMsg(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2600);
  }

  React.useEffect(() => {
    supabase.from('companies').select('name,person_label,people_label,entry_label,exit_label,exit_enabled').eq('id', companyId).maybeSingle()
      .then(({ data }) => { if (data) setLabels(data as any); });
  }, [companyId]);

  const navLabel = (s: Section) => s === 'employees' ? labels.people_label : SECTIONS.find(x => x.id === s)?.label;

  const nav = (
    <>
      {SECTIONS.map(s => (
        <button key={s.id} className={section === s.id ? 'active' : ''} onClick={() => setSection(s.id)}>{navLabel(s.id)}</button>
      ))}
    </>
  );

  return (
    <ToastContext.Provider value={showToast}>
    <div className="admin">
      <div className="admin-shell">
        <nav className="admin-nav">
          <div className="brand">RMD <span>PontoFace</span></div>
          {nav}
          <button className="logout" onClick={onLogout}>Sair</button>
        </nav>
        <main className="admin-main">
          <div className="admin-topbar">
            {section !== 'overview' && <button className="btn light back-btn" onClick={() => setSection('overview')}>← Voltar</button>}
            <h1>{navLabel(section)}</h1>
            {!pwa.installed && pwa.canInstall && <button className="btn light" onClick={pwa.install}>Instalar aplicativo</button>}
            <button className="btn light" onClick={onLogout}>Sair</button>
          </div>
          {pwa.showIosHint && <div className="fallback"><p style={{ margin: 0 }}>No iPhone ou iPad: toque no ícone de <b>Compartilhar</b> e depois em <b>"Adicionar à Tela de Início"</b>.</p><button className="link" onClick={() => pwa.setShowIosHint(false)}>Entendi</button></div>}
          {section === 'overview' ? <div className="mobile-nav">{nav}</div> : <div className="mobile-nav-back"><button className="btn light wide" onClick={() => setSection('overview')}>← Voltar ao menu</button></div>}
          {section === 'overview' && <Overview companyId={companyId} />}
          {section === 'employees' && <Employees companyId={companyId} role={role} labels={labels} />}
          {section === 'attendance' && <Attendance companyId={companyId} />}
          {section === 'locations' && <Locations companyId={companyId} />}
          {section === 'access' && <Access companyId={companyId} />}
          {section === 'import' && <BulkImport companyId={companyId} labels={labels} />}
          {section === 'company' && <CompanySettings companyId={companyId} role={role} />}
          {section === 'audit' && <Audit companyId={companyId} />}
        </main>
      </div>
      {toastMsg && <div className="toast-banner">{toastMsg}</div>}
    </div>
    </ToastContext.Provider>
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
function Employees({ companyId, role, labels }: { companyId: string; role: string; labels: { person_label: string; people_label: string } }) {
  const showToast = useToast();
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
    const res = await callFunction('admin-mutate', { table: 'employees', action: 'insert', company_id: companyId, payload: {
      full_name: form.full_name.trim(), registration_code: form.registration_code.trim(),
      job_title: form.job_title.trim() || null, department: form.department.trim() || null,
      document_last4: form.document_last4.trim() || null
    }});
    if (!res.ok) { setError(friendlyError((res.data as any)?.error)); return; }
    setForm({ full_name: '', registration_code: '', job_title: '', department: '', document_last4: '' });
    setShowForm(false);
    showToast(`${labels.person_label} cadastrado(a) com sucesso.`);
    load();
  }

  async function toggleActive(id: string, active: boolean) {
    const res = await callFunction('admin-mutate', { table: 'employees', action: 'update', company_id: companyId, id, payload: { active: !active } });
    if (!res.ok) { alert(friendlyError((res.data as any)?.error)); return; }
    showToast(active ? 'Desativado.' : 'Ativado.');
    load();
  }

  async function generateLink(id: string, name: string) {
    const res = await callFunction<{ path?: string; error?: string }>('generate-employee-access', { employee_id: id });
    if (!res.ok || !res.data.path) { alert(friendlyError((res.data as any)?.error)); return; }
    setLinkFor({ id, name, url: `${window.location.origin}${res.data.path}` });
    showToast('Link gerado com sucesso.');
  }

  return (
    <div>
      {canManage && <div className="card">
        <h2>{showForm ? `Nova pessoa (${labels.person_label})` : `${list.length} ${labels.people_label.toLowerCase()}`}</h2>
        {!showForm && <button className="btn green" onClick={() => setShowForm(true)}>+ Nova pessoa</button>}
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
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <a className="btn green" style={{ textDecoration: 'none' }} target="_blank" rel="noreferrer"
              href={`https://wa.me/?text=${encodeURIComponent(`Olá, ${linkFor.name}! Aqui está o seu link de acesso: ${linkFor.url}`)}`}>
              📲 Enviar pelo WhatsApp
            </a>
            <button className="btn light" onClick={() => setLinkFor(null)}>Fechar</button>
          </div>
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
  const [status, setStatus] = React.useState('Carregando o motor de reconhecimento...');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    // Pede a câmera IMEDIATAMENTE (no mesmo instante do clique), e carrega o
    // motor de reconhecimento em paralelo — em vez de esperar o motor carregar
    // primeiro, o que faz alguns navegadores recusarem o pedido de câmera depois.
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      .then(s => {
        if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
        stream = s;
        if (videoRef.current) { videoRef.current.srcObject = s; setStreaming(true); }
      })
      .catch(() => setStatus('Não foi possível acessar a câmera. Verifique as permissões do navegador.'));
    loadFaceModels().then(() => { if (!cancelled) setStatus(''); })
      .catch(() => { if (!cancelled) setStatus('Não foi possível carregar o motor de reconhecimento. Verifique sua conexão e recarregue a página.'); });
    return () => { cancelled = true; stream?.getTracks().forEach(t => t.stop()); };
  }, []);

  function capture() {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current, c = canvasRef.current;
    const scale = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
    c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
    setCaptured(c.toDataURL('image/jpeg', 0.92));
  }

  async function confirm() {
    if (!captured || !canvasRef.current) return;
    setBusy(true);
    setStatus('Analisando o rosto na foto...');

    try {
      const detection = await Promise.race([
        detectFace(canvasRef.current),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('FACE_ANALYSIS_TIMEOUT')), 15000)
        )
      ]);

      if (!detection) throw new Error('FACE_NOT_FOUND');
      const descriptor = Array.from(detection.descriptor);

      setStatus('Salvando cadastro facial...');

      // Toda a conclusão fica no servidor: a foto capturada é enviada junto
      // com o descritor e o servidor grava Storage + facial_profiles.
      const enrollPromise = supabase.functions.invoke('complete-face-enrollment', {
        body: {
          company_id: companyId,
          employee_id: employeeId,
          descriptor,
          photo_data_url: captured
        }
      });

      const enrollResult = await Promise.race([
        enrollPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('ENROLL_TIMEOUT')), 30000)
        )
      ]);

      const { data, error: enrollError } = enrollResult as {
        data: { ok?: boolean; error?: string } | null;
        error: { message?: string } | null;
      };

      if (enrollError) {
        console.error('complete-face-enrollment error', enrollError);
        const message = enrollError.message || '';
        if (message.includes('forbidden')) {
          setStatus('Você não tem permissão para cadastrar o rosto.');
        } else if (message.includes('employee_not_found_or_inactive')) {
          setStatus('Funcionário não encontrado ou inativo.');
        } else if (message.includes('invalid_descriptor')) {
          setStatus('O rosto não pôde ser processado. Tire outra foto com boa iluminação.');
        } else if (message.includes('invalid_photo')) {
          setStatus('A foto não pôde ser enviada. Tire outra foto.');
        } else if (message.includes('image_upload_failed')) {
          setStatus('Não foi possível salvar a foto no sistema.');
        } else if (message.includes('ENROLL_TIMEOUT')) {
          setStatus('A confirmação demorou mais que o esperado. Tente novamente.');
        } else {
          setStatus(message || 'Não foi possível concluir o cadastro facial.');
        }
        return;
      }

      if (!data?.ok) {
        setStatus(friendlyError(data?.error));
        return;
      }

      setStatus('Cadastro facial concluído');
      onDone();
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'FACE_ANALYSIS_TIMEOUT') {
        setStatus('Análise facial demorou mais que o esperado. Tire outra foto e tente novamente.');
      } else if (code === 'FACE_NOT_FOUND') {
        setStatus('Não foi possível analisar o rosto da foto. Tente novamente com boa iluminação e olhando diretamente para a câmera.');
      } else if (code === 'ENROLL_TIMEOUT') {
        setStatus('A confirmação demorou mais que o esperado. Tente novamente.');
      } else {
        setStatus('Não foi possível concluir o cadastro facial. Tente novamente.');
      }
    } finally {
      setBusy(false);
    }
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
  const showToast = useToast();
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
    const res = await callFunction('admin-mutate', { table: 'work_locations', action: 'insert', company_id: companyId, payload: { name: form.name.trim(), address: form.address.trim() || null, radius_m: Number(form.radius_m) || null } });
    if (!res.ok) { alert(friendlyError((res.data as any)?.error)); return; }
    setForm({ name: '', address: '', radius_m: '150' }); showToast('Localização adicionada.'); load();
  }
  async function toggle(id: string, active: boolean) {
    const res = await callFunction('admin-mutate', { table: 'work_locations', action: 'update', company_id: companyId, id, payload: { active: !active } });
    if (!res.ok) { alert(friendlyError((res.data as any)?.error)); return; }
    showToast(active ? 'Desativada.' : 'Ativada.');
    load();
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
  const showToast = useToast();
  const [list, setList] = React.useState<any[]>([]);
  React.useEffect(() => { load(); }, [companyId]);
  async function load() {
    const { data } = await supabase.from('employee_access').select('id,active,issued_at,revoked_at,last_access_at,employees!inner(id,full_name,company_id)').eq('employees.company_id', companyId).order('issued_at', { ascending: false });
    setList(data || []);
  }
  async function revoke(id: string) {
    const res = await callFunction('admin-mutate', { table: 'employee_access', action: 'revoke', company_id: companyId, id });
    if (!res.ok) { alert(friendlyError((res.data as any)?.error)); return; }
    showToast('Acesso revogado.');
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
  const showToast = useToast();
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
    const res = await callFunction('admin-mutate', { table: 'companies', action: 'update', company_id: companyId, id: companyId, payload: {
      name: company.name, legal_name: company.legal_name, tax_id: company.tax_id, phone: company.phone,
      biometric_liveness_threshold: company.biometric_liveness_threshold, biometric_face_match_threshold: company.biometric_face_match_threshold,
      biometric_enabled: company.biometric_enabled,
      person_label: company.person_label, people_label: company.people_label,
      entry_label: company.entry_label, exit_label: company.exit_label, exit_enabled: company.exit_enabled
    }});
    if (res.ok) { setSaved(true); showToast('Configurações salvas.'); setTimeout(() => setSaved(false), 2000); }
    else alert(friendlyError((res.data as any)?.error));
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
        <h2 style={{ marginTop: 8 }}>Textos do sistema</h2>
        <p className="helptext" style={{ marginBottom: 10 }}>Ajuste para o seu tipo de uso — RH, igreja, reunião, etc.</p>
        <div className="row2">
          <div className="field"><label>Nome no singular</label><input value={company.person_label || ''} onChange={e => setCompany({ ...company, person_label: e.target.value })} disabled={!canEdit} placeholder="Ex: Funcionário, Membro, Participante" /></div>
          <div className="field"><label>Nome no plural</label><input value={company.people_label || ''} onChange={e => setCompany({ ...company, people_label: e.target.value })} disabled={!canEdit} /></div>
        </div>
        <div className="row2">
          <div className="field"><label>Botão de entrada/presença</label><input value={company.entry_label || ''} onChange={e => setCompany({ ...company, entry_label: e.target.value })} disabled={!canEdit} placeholder="Ex: Bater entrada, Marcar presença" /></div>
          <div className="field"><label>Botão de saída</label><input value={company.exit_label || ''} onChange={e => setCompany({ ...company, exit_label: e.target.value })} disabled={!canEdit || !company.exit_enabled} /></div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, marginBottom: 14 }}>
          <button type="button" className={`switch ${company.exit_enabled ? 'on' : ''}`} disabled={!canEdit} onClick={() => setCompany({ ...company, exit_enabled: !company.exit_enabled })}></button>
          Usar botão de saída (desligue se for só marcar presença, sem saída)
        </label>
        <h2 style={{ marginTop: 8 }}>Biometria</h2>
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

/* ---------------------------- Bulk Import ---------------------------- */
function BulkImport({ companyId, labels }: { companyId: string; labels: { person_label: string; people_label: string } }) {
  const showToast = useToast();
  const [rows, setRows] = React.useState<Record<string, string>[]>([]);
  const [csvName, setCsvName] = React.useState('');
  const [zipFile, setZipFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [log, setLog] = React.useState<string[]>([]);

  function onCsvPick(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]; if (!file) return;
    setCsvName(file.name);
    file.text().then(text => {
      const parsed = parseCsv(text).map(normalizeImportRow).filter(r => r.full_name && r.registration_code);
      setRows(parsed);
    });
  }

  async function runImport() {
    if (!rows.length) return;
    setBusy(true); setLog([`Enviando ${rows.length} registro(s)...`]);
    const res = await callFunction<{ imported?: number; error?: string; employees?: { id: string; registration_code: string }[] }>('bulk-import-employees', { company_id: companyId, rows });
    if (!res.ok) { setLog(l => [...l, friendlyError((res.data as any)?.error)]); setBusy(false); return; }
    setLog(l => [...l, `${res.data.imported} pessoa(s) importada(s) com sucesso.`]);
    showToast(`${res.data.imported} pessoa(s) importada(s).`);

    if (zipFile && res.data.employees?.length) {
      setLog(l => [...l, 'Processando fotos do arquivo zip...']);
      await loadFaceModels();
      const zip = await JSZip.loadAsync(zipFile);
      let matched = 0, enrolled = 0, failed = 0;
      for (const emp of res.data.employees) {
        const entry = Object.keys(zip.files).find(name => {
          const base = name.split('/').pop() || name;
          const stem = base.replace(/\.[^.]+$/, '');
          return stem.toLowerCase() === emp.registration_code.toLowerCase();
        });
        if (!entry) continue;
        matched++;
        try {
          const blob = await zip.files[entry].async('blob');
          const bitmap = await createImageBitmap(blob);
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width; canvas.height = bitmap.height;
          canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
          const detection = await detectFace(canvas);
          if (!detection) { failed++; continue; }
          const descriptor = Array.from(detection.descriptor);
          const path = `${emp.id}/reference.jpg`;
          const jpegBlob: Blob = await new Promise(resolve => canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.9));
          await supabase.storage.from('facial-references').upload(path, jpegBlob, { upsert: true, contentType: 'image/jpeg' });
          const enrollRes = await callFunction('enroll-employee-face', { company_id: companyId, employee_id: emp.id, descriptor, reference_image_path: path });
          if (enrollRes.ok) enrolled++; else failed++;
        } catch { failed++; }
      }
      setLog(l => [...l, `Fotos: ${matched} encontrada(s) pelo nome do arquivo, ${enrolled} rosto(s) cadastrado(s), ${failed} não reconhecida(s).`]);
    }
    setBusy(false);
    setRows([]); setCsvName(''); setZipFile(null);
  }

  return (
    <div>
      <div className="card">
        <h2>Importar {labels.people_label.toLowerCase()} em lote</h2>
        <p className="helptext" style={{ marginBottom: 12 }}>
          Envie uma planilha CSV com as colunas <b>nome</b> e <b>matrícula</b> (obrigatórias) e, se quiser, <b>cargo</b>, <b>departamento</b>, <b>documento</b>.
          Já existe {labels.person_label.toLowerCase()} com a mesma matrícula? Os dados dele são atualizados, sem duplicar.
        </p>
        <div className="field"><label>Planilha CSV</label><input type="file" accept=".csv,text/csv" onChange={onCsvPick} /></div>
        {csvName && <p className="helptext">{csvName} — {rows.length} registro(s) reconhecido(s)</p>}
        <div className="field"><label>Fotos (opcional) — um arquivo .zip com uma foto por pessoa</label><input type="file" accept=".zip" onChange={e => setZipFile(e.target.files?.[0] || null)} /></div>
        <p className="helptext" style={{ marginBottom: 12 }}>Nomeie cada foto com a matrícula da pessoa (ex: <b>1024.jpg</b>) para o sistema reconhecer automaticamente quem é quem.</p>
        <button className="btn green" disabled={!rows.length || busy} onClick={runImport}>{busy ? 'Importando...' : `Importar ${rows.length || ''} registro(s)`}</button>
        {log.length > 0 && <div className="notice" style={{ marginTop: 12 }}>{log.map((l, i) => <div key={i}>{l}</div>)}</div>}
      </div>
      {rows.length > 0 && (
        <div className="card">
          <h2>Prévia (primeiras 10 linhas)</h2>
          <table>
            <thead><tr><th>Nome</th><th>Matrícula</th><th>Cargo</th><th>Departamento</th></tr></thead>
            <tbody>{rows.slice(0, 10).map((r, i) => <tr key={i}><td>{r.full_name}</td><td>{r.registration_code}</td><td>{r.job_title || '-'}</td><td>{r.department || '-'}</td></tr>)}</tbody>
          </table>
        </div>
      )}
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
