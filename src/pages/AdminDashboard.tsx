import React from 'react';
import { supabase, callFunction, friendlyError } from '../lib/supabaseClient';
import { loadFaceModels, detectFace } from '../lib/faceEngine';
import { parseCsv, normalizeImportRow } from '../lib/csv';
import { usePwaInstall } from '../lib/pwaInstall';
import JSZip from 'jszip';
import { useAutoRefresh } from '../lib/useAutoRefresh';

const ToastContext = React.createContext<(msg: string) => void>(() => {});
function useToast() { return React.useContext(ToastContext); }

type Props = { companyId: string; role: string; onLogout: () => void };

type Section = 'overview' | 'employees' | 'attendance' | 'locations' | 'access' | 'import' | 'schedule' | 'presence' | 'company' | 'audit';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'overview', label: 'Dashboard' },
  { id: 'employees', label: 'Pessoas' },
  { id: 'attendance', label: 'Controle de Presença' },
  { id: 'locations', label: 'Localizações' },
  { id: 'access', label: 'Acessos' },
  { id: 'import', label: 'Importar' },
  { id: 'schedule', label: 'Jornada' },
  { id: 'presence', label: 'Modo de presença' },
  { id: 'company', label: 'Empresa' },
  { id: 'audit', label: 'Auditoria' },
];

export default function AdminDashboard({ companyId, role, onLogout }: Props) {
  const [section, setSection] = React.useState<Section>('overview');
  const [labels, setLabels] = React.useState({ person_label: 'Funcionário', people_label: 'Funcionários', entry_label: 'Bater entrada', exit_label: 'Bater saída', exit_enabled: true, presence_mode: 'both', name: 'RMD PontoFace' });
  const pwa = usePwaInstall('/admin');
  const [toastMsg, setToastMsg] = React.useState<string | null>(null);
  const [companyAlerts, setCompanyAlerts] = React.useState<any[]>([]);
  const toastTimer = React.useRef<number | null>(null);
  function showToast(msg: string) {
    setToastMsg(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2600);
  }

  React.useEffect(() => {
    supabase.from('companies').select('name,person_label,people_label,entry_label,exit_label,exit_enabled,presence_mode').eq('id', companyId).maybeSingle()
      .then(({ data }) => { if (data) setLabels(data as any); });
  }, [companyId]);

  async function refreshLiveCompany() {
    try {
      const [{ data:companyData }, alertResult] = await Promise.all([
        supabase.from('companies').select('name,person_label,people_label,entry_label,exit_label,exit_enabled').eq('id', companyId).maybeSingle(),
        supabase.functions.invoke('check-attendance-alerts', { body: { company_id: companyId } })
      ]);
      if (companyData) setLabels(companyData as any);
      if (!alertResult.error && alertResult.data?.ok) setCompanyAlerts(Array.isArray(alertResult.data.alerts) ? alertResult.data.alerts : []);
    } catch {}
    window.dispatchEvent(new Event('rmd:company-sync'));
  }

  React.useEffect(() => {
    refreshLiveCompany();
  }, [companyId]);

  useAutoRefresh(
    refreshLiveCompany,
    'company-' + companyId,
    [
      { table: 'attendance_records', filter: 'company_id=eq.' + companyId },
      { table: 'attendance_alerts', filter: 'company_id=eq.' + companyId },
      { table: 'employees', filter: 'company_id=eq.' + companyId },
      { table: 'employee_work_schedules', filter: 'company_id=eq.' + companyId },
      { table: 'work_locations', filter: 'company_id=eq.' + companyId }
    ],
    7000
  );

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
          {section === 'overview' && <Overview companyId={companyId} companyAlerts={companyAlerts} />}
          {section === 'employees' && <Employees companyId={companyId} role={role} labels={labels} />}
          {section === 'attendance' && <Attendance companyId={companyId} role={role} companyAlerts={companyAlerts} />}
          {section === 'locations' && <Locations companyId={companyId} />}
          {section === 'access' && <Access companyId={companyId} />}
          {section === 'import' && <BulkImport companyId={companyId} labels={labels} />}
          {section === 'schedule' && <Schedules companyId={companyId} />}
          {section === 'presence' && <PresenceMode companyId={companyId} role={role} />}
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
function Overview({ companyId, companyAlerts }: { companyId: string; companyAlerts: any[] }) {
  const [stats, setStats] = React.useState({ total: 0, working: 0, out: 0, pending: 0, occurrences: 0 });
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    load();
    const sync = () => { void load(); };
    window.addEventListener('rmd:company-sync', sync);
    return () => window.removeEventListener('rmd:company-sync', sync);
  }, [companyId]);

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
    <>
      <div className="kpis">
      <div className="kpi"><small>Total de funcionários</small><b>{stats.total}</b></div>
      <div className="kpi"><small>Trabalhando</small><b>{stats.working}</b></div>
      <div className="kpi"><small>Fora</small><b>{stats.out}</b></div>
      <div className="kpi"><small>Pendentes offline</small><b>{stats.pending}</b></div>
      <div className="kpi"><small>Ocorrências (24h)</small><b>{stats.occurrences}</b></div>
      </div>
      <CompanyEntryAlerts alerts={companyAlerts} />
    </>
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

  React.useEffect(() => {
    load();
    const sync = () => { void load(); };
    window.addEventListener('rmd:company-sync', sync);
    return () => window.removeEventListener('rmd:company-sync', sync);
  }, [companyId]);
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

  async function deleteFace(id: string, name: string) {
    if (!window.confirm(`Excluir a foto/cadastro facial de ${name}? Essa ação remove o cadastro biométrico, mas não exclui o funcionário.`)) return;
    const { data, error } = await supabase.functions.invoke('delete-employee-data', {
      body: { company_id: companyId, employee_id: id, action: 'photo' }
    });
    if (error || !data?.ok) {
      alert(error?.message || friendlyError(data?.error));
      return;
    }
    showToast('Foto e cadastro facial excluídos.');
    load();
  }

  async function deleteEmployee(id: string, name: string) {
    if (!window.confirm(`Excluir permanentemente o funcionário ${name}? Os dados pessoais, acesso e cadastro facial serão removidos. O histórico de ponto será preservado sem o vínculo com o funcionário.`)) return;
    const { data, error } = await supabase.functions.invoke('delete-employee-data', {
      body: { company_id: companyId, employee_id: id, action: 'employee' }
    });
    if (error || !data?.ok) {
      alert(error?.message || friendlyError(data?.error));
      return;
    }
    setEnrollFor(null);
    setLinkFor(null);
    showToast('Funcionário excluído.');
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
                  {canManage && e.facial_status === 'enrolled' && <button className="btn light" onClick={() => deleteFace(e.id, e.full_name)}>Excluir foto</button>}
                  {canManage && <button className="btn light" onClick={() => toggleActive(e.id, e.active)}>{e.active ? 'Desativar' : 'Ativar'}</button>}
                  {canManage && <button className="btn danger" onClick={() => deleteEmployee(e.id, e.full_name)}>Excluir funcionário</button>}
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
  const [modelsReady, setModelsReady] = React.useState(false);
  const [captured, setCaptured] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState('Carregando o motor de reconhecimento...');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    // Câmera e modelos carregam em paralelo. O botão de captura só é liberado
    // quando as duas etapas estiverem realmente prontas.
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      .then(s => {
        if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          setStreaming(true);
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('Não foi possível acessar a câmera. Verifique as permissões do navegador.');
      });

    loadFaceModels()
      .then(() => {
        if (!cancelled) {
          setModelsReady(true);
          if (!captured) setStatus('');
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('Não foi possível carregar o motor de reconhecimento. Verifique sua conexão e recarregue a página.');
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  function capture() {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current, c = canvasRef.current;

    if (!v.videoWidth || !v.videoHeight) {
      setStatus('A câmera ainda não está pronta. Aguarde um instante e tente novamente.');
      return;
    }

    const scale = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    const ctx = c.getContext('2d');
    if (!ctx) {
      setStatus('Não foi possível capturar a imagem. Tente novamente.');
      return;
    }

    ctx.drawImage(v, 0, 0, c.width, c.height);
    setCaptured(c.toDataURL('image/jpeg', 0.92));
    setStatus('');
  }

  async function confirm() {
    if (!captured || busy) return;
    setBusy(true);
    setStatus('Preparando análise facial...');

    try {
      // Garante que os três modelos estejam carregados antes de iniciar a análise.
      await Promise.race([
        loadFaceModels(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('FACE_MODELS_TIMEOUT')), 20000)
        )
      ]);

      setStatus('Analisando o rosto na foto...');

      // Analisa a própria imagem capturada, já decodificada, e não um canvas
      // que pode estar sendo reutilizado pelo navegador.
      const image = await Promise.race([
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('IMAGE_DECODE_FAILED'));
          img.src = captured;
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('IMAGE_DECODE_TIMEOUT')), 10000)
        )
      ]);

      const detection = await Promise.race([
        detectFace(image),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('FACE_ANALYSIS_TIMEOUT')), 45000)
        )
      ]);

      if (!detection) throw new Error('FACE_NOT_FOUND');
      const descriptor = Array.from(detection.descriptor);

      setStatus('Salvando cadastro facial...');

      // Uma única operação no servidor: salva a foto e o perfil facial juntos.
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

      if (code === 'FACE_MODELS_TIMEOUT') {
        setStatus('O motor facial ainda não terminou de carregar. Recarregue a página e tente novamente.');
      } else if (code === 'IMAGE_DECODE_TIMEOUT') {
        setStatus('A foto não pôde ser preparada para análise. Tire outra foto.');
      } else if (code === 'FACE_ANALYSIS_TIMEOUT') {
        setStatus('A análise facial demorou mais que o esperado. Tente novamente após o carregamento completo do reconhecimento.');
      } else if (code === 'FACE_NOT_FOUND') {
        setStatus('Não foi possível identificar um rosto nessa foto. Olhe diretamente para a câmera e use boa iluminação.');
      } else if (code === 'ENROLL_TIMEOUT') {
        setStatus('A confirmação demorou mais que o esperado. Tente novamente.');
      } else {
        console.error('cadastro facial error', error);
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
        {captured && <button className="btn light" disabled={busy} onClick={() => { setCaptured(null); setStatus(''); }}>Tirar novamente</button>}
        {captured && <button className="btn green" disabled={busy} onClick={confirm}>{busy ? 'Processando...' : 'Confirmar cadastro'}</button>}
        <button className="btn light" disabled={busy} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}
function CompanyEntryAlerts({ alerts }: { alerts: any[] }) {
  const entryAlerts = (alerts || []).filter((a: any) => {
    const message = String(a?.message || '').toLowerCase();
    const type = String(a?.alert_type || a?.type || '').toLowerCase();
    const delta = Number(a?.minutes_delta);
    return (type.includes('late') || type.includes('entry') || message.includes('entrada') || message.includes('atras')) && delta > 0;
  }).slice(0, 5);

  if (!entryAlerts.length) return null;
  return (
    <div className="card" style={{ border: '1px solid #e2b65c', background: '#fff8df', marginBottom: 14 }}>
      <h2 style={{ marginBottom: 8 }}>⚠ Alertas de entrada</h2>
      {entryAlerts.map((a: any) => (
        <div key={a.id} style={{ padding: '9px 0', borderBottom: '1px solid #ead99c' }}>
          <b>{a.employees?.full_name || a.employee_name_snapshot || 'Funcionário'}</b>
          <div style={{ marginTop: 3 }}>{a.message}</div>
          <div className="tag danger" style={{ marginTop: 4 }}>Atraso na entrada: {Math.round(deltaMinutes(a.minutes_delta))} min</div>
        </div>
      ))}
    </div>
  );
}

function deltaMinutes(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/* ---------------------------- Attendance ---------------------------- */
function Attendance({ companyId, role, companyAlerts }: { companyId: string; role: string; companyAlerts: any[] }) {
  const showToast = useToast();
  const [rows, setRows] = React.useState<any[]>([]);
  const [employees, setEmployees] = React.useState<any[]>([]);
  const [schedules, setSchedules] = React.useState<any[]>([]);
  const [alerts, setAlerts] = React.useState<any[]>([]);
  const [allRecords, setAllRecords] = React.useState<any[]>([]);
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [openHistory, setOpenHistory] = React.useState<string | null>(null);
  const [historyCache, setHistoryCache] = React.useState<Record<string, any[]>>({});
  const [loading, setLoading] = React.useState(true);
  const initialLoadRef = React.useRef(true);
  const canReset = ['owner', 'admin', 'hr'].includes(role);

  React.useEffect(() => { load(); }, [companyId, date]);

  // LIVE_ATTENDANCE_REFRESH_ENABLED
  useAutoRefresh(
    load,
    'attendance-' + companyId + '-' + date,
    [
      { table: 'attendance_records', filter: 'company_id=eq.' + companyId },
      { table: 'attendance_alerts', filter: 'company_id=eq.' + companyId },
      { table: 'employees', filter: 'company_id=eq.' + companyId },
      { table: 'employee_work_schedules', filter: 'company_id=eq.' + companyId }
    ],
    5000
  );

  async function load() {
    const firstLoad = initialLoadRef.current;
    if (firstLoad) setLoading(true);
    const start = new Date(date + 'T00:00:00');
    const end = new Date(date + 'T23:59:59.999');
    const [{ data: dayRows }, { data: empRows }, { data: schedRows }, { data: alertRows }, { data: historyRows }] = await Promise.all([
      supabase.from('attendance_records')
        .select('id,employee_id,punch_type,occurred_at,identification_method,location_label,location_address,location_status,location_distance_m,location_accuracy_m,scheduled_minutes,worked_minutes,balance_minutes,schedule_status,offline,employee_name_snapshot')
        .eq('company_id', companyId).gte('occurred_at', start.toISOString()).lte('occurred_at', end.toISOString())
        .order('occurred_at', { ascending: true }),
      supabase.from('employees').select('id,full_name,registration_code,job_title,active').eq('company_id', companyId).order('full_name'),
      supabase.from('employee_work_schedules').select('employee_id,weekday,enabled,morning_enabled,afternoon_enabled,entry_time,exit_time').eq('company_id', companyId),
      supabase.from('attendance_alerts').select('id,employee_id,alert_type,minutes_delta,message,created_at,acknowledged')
        .eq('company_id', companyId).gte('created_at', start.toISOString()).lte('created_at', end.toISOString()).order('created_at', { ascending: false }),
      supabase.from('attendance_records').select('id,employee_id,punch_type,occurred_at,balance_minutes')
        .eq('company_id', companyId).order('occurred_at', { ascending: true })
    ]);
    setRows(dayRows || []);
    setEmployees(empRows || []);
    setSchedules(schedRows || []);
    setAlerts(alertRows || []);
    setAllRecords(historyRows || []);
    if (firstLoad) {
      initialLoadRef.current = false;
      setLoading(false);
    }
  }

  const selectedWeekday = new Date(date + 'T12:00:00').getDay() || 7;

  const byEmployee = React.useMemo(() => {
    const map = new Map<string, any>();
    for (const e of employees) {
      const schedule = schedules.find((s: any) => s.employee_id === e.id && Number(s.weekday) === selectedWeekday);
      map.set(e.id, { employee: e, rows: [], alerts: [], totalBalance: 0, schedule });
    }
    for (const r of rows) {
      const id = r.employee_id;
      if (!id) continue;
      if (!map.has(id)) map.set(id, { employee: { id, full_name: r.employee_name_snapshot || 'Funcionário', active: true }, rows: [], alerts: [], totalBalance: 0, schedule: null });
      map.get(id).rows.push(r);
    }
    for (const a of alerts) {
      if (map.has(a.employee_id)) map.get(a.employee_id).alerts.push(a);
    }

    // Somamos somente o saldo final de cada dia, uma vez por dia.
    const lastByDay = new Map<string, any>();
    for (const r of allRecords) {
      if (!r.employee_id || r.balance_minutes == null) continue;
      const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(r.occurred_at));
      lastByDay.set(r.employee_id + '|' + dayKey, r);
    }
    for (const r of lastByDay.values()) {
      if (map.has(r.employee_id)) map.get(r.employee_id).totalBalance += Number(r.balance_minutes || 0);
    }
    return [...map.values()].sort((a,b) => String(a.employee.full_name).localeCompare(String(b.employee.full_name)));
  }, [employees, schedules, rows, alerts, allRecords, selectedWeekday]);

  async function openEmployeeHistory(employeeId: string) {
    if (openHistory === employeeId) {
      setOpenHistory(null);
      return;
    }
    setOpenHistory(employeeId);
    if (historyCache[employeeId]) return;
    const { data } = await supabase.from('attendance_records')
      .select('id,punch_type,occurred_at,location_label,location_address,location_status,worked_minutes,balance_minutes,schedule_status')
      .eq('company_id', companyId).eq('employee_id', employeeId).order('occurred_at', { ascending: false }).limit(120);
    setHistoryCache(prev => ({ ...prev, [employeeId]: data || [] }));
  }

  async function resetAttendance(scope: 'day' | 'employee_day' | 'employee_all' | 'all', employeeId?: string, employeeName?: string) {
    const label = scope === 'all'
      ? 'TODO o histórico de pontos da empresa'
      : scope === 'employee_all'
        ? 'TODO o histórico deste funcionário'
        : scope === 'employee_day'
          ? 'os pontos deste funcionário no dia selecionado'
          : 'TODOS os pontos do dia selecionado';
    const warning = scope === 'all'
      ? 'Esta ação é permanente e apagará todos os registros de ponto e alertas da empresa. Os cadastros de funcionários e jornadas não serão apagados.'
      : 'Esta ação é permanente e apagará os registros de ponto e alertas selecionados.';
    if (!window.confirm('Apagar ' + label + '?\n\n' + warning + '\n\nDeseja continuar?')) return;

    const { data, error } = await supabase.functions.invoke('delete-attendance-history', {
      body: { company_id: companyId, scope, date: (scope === 'all' || scope === 'employee_all') ? undefined : date, employee_id: (scope === 'employee_day' || scope === 'employee_all') ? employeeId : undefined }
    });
    if (error || !data?.ok) {
      alert(error?.message || data?.error || 'Não foi possível apagar o histórico.');
      return;
    }
    setOpenHistory(null);
    setHistoryCache({});
    showToast((data.deleted_records || 0) + ' ponto(s) apagado(s).');
    load();
  }

  return (
    <div>
      <CompanyEntryAlerts alerts={companyAlerts} />
      <div className="card" style={{display:'flex',gap:12,alignItems:'flex-end',flexWrap:'wrap'}}>
        <div className="field" style={{margin:0}}><label>Dia exibido</label><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
        <button className="btn light" onClick={exportCsv}>Exportar CSV</button>
        {canReset && <button className="btn light" onClick={()=>resetAttendance('day')}>🗑 Apagar pontos deste dia</button>}
        {canReset && <button className="btn danger" onClick={()=>resetAttendance('all')}>♻ Zerar todo o histórico</button>}
      </div>

      {loading && <p className="empty-row">Carregando...</p>}

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(290px,1fr))',gap:12,marginBottom:14}}>
        {byEmployee.map(item => {
          const completed = item.rows.length;
          const firstEntry = item.rows.find((r:any) => r.punch_type === 'entry');
          const scheduledEntry = item.schedule?.entry_time || null;
          let entryDelta: number | null = null;
          if (firstEntry && scheduledEntry) {
            const [sh, sm] = String(scheduledEntry).slice(0,5).split(':').map(Number);
            const dt = new Date(firstEntry.occurred_at);
            const actualMinutes = dt.getHours() * 60 + dt.getMinutes();
            const scheduledMinutes = sh * 60 + sm;
            entryDelta = actualMinutes - scheduledMinutes;
          }
          const maxToday = item.schedule?.afternoon_enabled === true ? 4 : (item.schedule?.enabled === false ? 0 : 2);
          return (
            <div className="card" key={item.employee.id} style={{margin:0}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                <div>
                  <small>Funcionário</small>
                  <h2 style={{margin:'2px 0 0'}}>{item.employee.full_name}</h2>
                  <div className="helptext">{item.employee.job_title || 'Funcionário'}{item.employee.registration_code ? ' • '+item.employee.registration_code : ''}</div>
                </div>
                <div style={{fontSize:30}}>📁</div>
              </div>

              <div style={{marginTop:10,display:'grid',gap:7}}>
                <div><b>Pontos do dia:</b> {completed}/{maxToday || '—'}</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:2}}>
                  {item.rows.map((p:any) => (
                    <span key={p.id} className="tag">{p.punch_type==='entry'?'Entrada':'Saída'} {new Date(p.occurred_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>
                  ))}
                </div>
                {entryDelta !== null && entryDelta !== 0 && (
                  <div style={{fontWeight:800,color:entryDelta>0?'var(--danger)':'var(--brand-2)'}}>
                    {entryDelta > 0 ? 'Atraso na entrada: ' + entryDelta + ' min' : 'Entrada antecipada: +' + Math.abs(entryDelta) + ' min'}
                  </div>
                )}

                {item.alerts.slice(0,2).map((a:any)=>
                  <div key={a.id} className="helptext" style={{color:Number(a.minutes_delta)<0?'var(--danger)':'inherit'}}>⚠ {a.message}</div>
                )}
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:10}}>
                <button className="btn light" onClick={()=>openEmployeeHistory(item.employee.id)}>
                  {openHistory===item.employee.id ? 'Fechar pasta' : '📁 Histórico'}
                </button>
                {canReset && <button className="btn light" onClick={()=>resetAttendance('employee_day',item.employee.id,item.employee.full_name)}>🗑 Limpar dia</button>
                }
                {canReset && openHistory===item.employee.id && <button className="btn danger" onClick={()=>resetAttendance('employee_all',item.employee.id,item.employee.full_name)}>♻ Zerar histórico</button>}
              </div>

              {openHistory===item.employee.id && (
                <div style={{marginTop:10,maxHeight:300,overflowY:'auto',borderTop:'1px solid var(--border)',paddingTop:8}}>
                  {(historyCache[item.employee.id] || []).map((h:any)=>(
                    <div key={h.id} style={{borderTop:'1px solid var(--border)',padding:'8px 0'}}>
                      <div style={{display:'flex',justifyContent:'space-between',gap:8}}>
                        <b>{h.punch_type==='entry'?'Entrada':'Saída'}</b>
                        <span>{new Date(h.occurred_at).toLocaleString('pt-BR')}</span>
                      </div>
                      <div className="helptext">{h.location_address || h.location_label || 'Localização não identificada'}</div>
                      {h.balance_minutes != null && Number(h.balance_minutes)!==0 && <div style={{fontWeight:800,color:Number(h.balance_minutes)<0?'var(--danger)':'var(--brand-2)'}}>Saldo {Number(h.balance_minutes)>0?'+':''}{Math.round(Number(h.balance_minutes))} min</div>}
                    </div>
                  ))}
                  {!historyCache[item.employee.id]?.length && <div className="helptext">Nenhum histórico anterior.</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="helptext" style={{ marginTop: 4, marginBottom: 18 }}>
        Selecione a pasta de um funcionário para consultar o histórico antigo. Na tela principal ficam apenas os pontos e o saldo do dia.
      </div>
    </div>
  );

  function exportCsv() {
    const header='Funcionario,Tipo,Horario,Localizacao,Saldo(min),Offline\n';
    const body=rows.map((r:any)=>[r.employee_name_snapshot||'',r.punch_type,r.occurred_at,(r.location_address||r.location_label||'Localização não identificada').replace(/,/g,' '),r.balance_minutes??'',r.offline?'sim':'nao'].join(',')).join('\n');
    const blob=new Blob([header+body],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='ponto-'+date+'.csv'; a.click(); URL.revokeObjectURL(url);
  }
}



/* ---------------------------- Locations ---------------------------- */
function Locations({ companyId }: { companyId: string }) {
  const showToast = useToast();
  const [list, setList] = React.useState<any[]>([]);
  const [form, setForm] = React.useState({ name: '', address: '', radius_m: '150', latitude: null as number | null, longitude: null as number | null });
  const [gpsBusy, setGpsBusy] = React.useState(false);

  React.useEffect(() => {
    load();
    const sync = () => { void load(); };
    window.addEventListener('rmd:company-sync', sync);
    return () => window.removeEventListener('rmd:company-sync', sync);
  }, [companyId]);
  async function load() {
    const { data } = await supabase.from('work_locations').select('id,name,address,radius_m,active,latitude,longitude').eq('company_id', companyId).order('name');
    setList(data || []);
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const res = await callFunction('admin-mutate', { table: 'work_locations', action: 'insert', company_id: companyId, payload: { name: form.name.trim(), address: form.address.trim() || null, radius_m: Number(form.radius_m) || null, latitude: form.latitude, longitude: form.longitude } });
    if (!res.ok) { alert(friendlyError((res.data as any)?.error)); return; }
    setForm({ name: '', address: '', radius_m: '150', latitude: null, longitude: null }); showToast('Localização adicionada.'); load();
  }
  async function toggle(id: string, active: boolean) {
    const res = await callFunction('admin-mutate', { table: 'work_locations', action: 'update', company_id: companyId, id, payload: { active: !active } });
    if (!res.ok) { alert(friendlyError((res.data as any)?.error)); return; }
    showToast(active ? 'Desativada.' : 'Ativada.');
    load();
  }

  async function deleteLocation(id: string, name: string) {
    if (!window.confirm(`Excluir permanentemente a localização "${name}"? Os registros de ponto existentes manterão o histórico, mas deixarão de apontar para esta localização.`)) return;
    const { data, error } = await supabase.functions.invoke('delete-company-item', {
      body: { company_id: companyId, table: 'work_locations', id }
    });
    if (error || !data?.ok) {
      alert(error?.message || friendlyError(data?.error));
      return;
    }
    showToast('Localização excluída.');
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
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:10 }}>
            <button type="button" className="btn light" disabled={gpsBusy} onClick={() => {
              if (!navigator.geolocation) { alert('Este aparelho não oferece localização.'); return; }
              setGpsBusy(true);
              navigator.geolocation.getCurrentPosition(
                p => { setGpsBusy(false); setForm(f => ({ ...f, latitude:p.coords.latitude, longitude:p.coords.longitude })); },
                () => { setGpsBusy(false); alert('Não foi possível obter o GPS. Permita a localização no navegador.'); },
                { enableHighAccuracy:true, maximumAge:0, timeout:15000 }
              );
            }}>{gpsBusy ? 'Obtendo GPS...' : '📍 Marcar posição pelo GPS'}</button>
            <span className="helptext">{form.latitude != null ? 'Posição da unidade capturada.' : 'Marque a posição exata da unidade.'}</span>
          </div>
          <button className="btn green" type="submit">Adicionar</button>
        </form>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Nome</th><th>Endereço</th><th>Raio</th><th>GPS</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {list.map(l => (
              <tr key={l.id}>
                <td>{l.name}</td><td>{l.address || '-'}</td><td>{l.radius_m ? `${l.radius_m}m` : '-'}</td><td>{l.latitude != null && l.longitude != null ? <span className="tag">Definido</span> : <span className="tag warn">Não definido</span>}</td>
                <td><span className={`tag ${l.active ? '' : 'off'}`}>{l.active ? 'Ativa' : 'Inativa'}</span></td>
                <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn light" onClick={() => toggle(l.id, l.active)}>{l.active ? 'Desativar' : 'Ativar'}</button>
                  <button className="btn danger" onClick={() => deleteLocation(l.id, l.name)}>Excluir</button>
                </td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={6} className="empty-row">Nenhuma localização cadastrada.</td></tr>}
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
  React.useEffect(() => {
    load();
    const sync = () => { void load(); };
    window.addEventListener('rmd:company-sync', sync);
    return () => window.removeEventListener('rmd:company-sync', sync);
  }, [companyId]);
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

  async function deleteAccess(id: string, employeeName: string) {
    if (!window.confirm(`Excluir definitivamente o acesso de ${employeeName}? O funcionário continuará cadastrado, mas este link de acesso será removido.`)) return;
    const { data, error } = await supabase.functions.invoke('delete-company-item', {
      body: { company_id: companyId, table: 'employee_access', id }
    });
    if (error || !data?.ok) {
      alert(error?.message || friendlyError(data?.error));
      return;
    }
    showToast('Acesso excluído.');
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
              <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {a.active && <button className="btn light" onClick={() => revoke(a.id)}>Revogar</button>}
                <button className="btn danger" onClick={() => deleteAccess(a.id, a.employees?.full_name || 'este funcionário')}>Excluir</button>
              </td>
            </tr>
          ))}
          {!list.length && <tr><td colSpan={5} className="empty-row">Nenhum acesso gerado ainda.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------- Jornada semanal ---------------------------- */
function Schedules({ companyId }: { companyId: string }) {
  const showToast = useToast();
  const days = [
    [1, 'Segunda-feira'], [2, 'Terça-feira'], [3, 'Quarta-feira'], [4, 'Quinta-feira'],
    [5, 'Sexta-feira'], [6, 'Sábado'], [7, 'Domingo']
  ] as const;
  const [employees, setEmployees] = React.useState<any[]>([]);
  const [employeeId, setEmployeeId] = React.useState('');
  const [rows, setRows] = React.useState<any[]>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    supabase.from('employees').select('id,full_name,registration_code')
      .eq('company_id', companyId).eq('active', true).order('full_name')
      .then(({ data }) => {
        const list = data || [];
        setEmployees(list);
        if (!employeeId && list[0]) setEmployeeId(list[0].id);
      });
  }, [companyId]);

  React.useEffect(() => {
    if (!employeeId) { setRows([]); return; }
    supabase.from('employee_work_schedules').select('*')
      .eq('company_id', companyId).eq('employee_id', employeeId).order('weekday')
      .then(({ data }) => {
        const existing = data || [];
        setRows(days.map(([weekday]) => {
          const found = existing.find((x: any) => Number(x.weekday) === weekday);
          return found || {
            weekday,
            enabled: weekday <= 5,
            morning_enabled: true,
            afternoon_enabled: false,
            entry_time: '08:00',
            break_start_time: '12:00',
            break_end_time: '14:00',
            exit_time: weekday === 6 ? '12:00' : '18:00',
            tolerance_late_minutes: 0,
            tolerance_early_minutes: 0,
            notify_employee_late: true,
            notify_employee_missing: true,
            notify_employee_overtime: true,
            notify_company: true
          };
        }));
      });
  }, [companyId, employeeId]);

  function patchRow(weekday: number, patch: any) {
    setRows(current => current.map(r => r.weekday === weekday ? { ...r, ...patch } : r));
  }

  async function save() {
    if (!employeeId) { alert('Selecione um funcionário.'); return; }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke('save-employee-schedule', {
      body: { company_id: companyId, employee_id: employeeId, schedules: rows }
    });
    setSaving(false);
    if (error || !data?.ok) {
      alert(error?.message || data?.error || 'Não foi possível salvar a jornada.');
      return;
    }
    showToast('Jornada semanal salva.');
  }

  return (
    <div>
      <div className="card">
        <h2>Carga horária do funcionário</h2>
        <p className="helptext">Ative ou inative o dia inteiro e controle separadamente os períodos da manhã e da tarde. Período inativo não entra no cálculo e não libera batidas.</p>
        <div className="field" style={{ maxWidth: 480 }}>
          <label>Funcionário</label>
          <select value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
            {!employees.length && <option value="">Nenhum funcionário ativo</option>}
            {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}{e.registration_code ? ' — ' + e.registration_code : ''}</option>)}
          </select>
        </div>
      </div>

      {employeeId && <div className="card">
        <div style={{ overflowX:'auto' }}>
          <table style={{ minWidth: 1180 }}>
            <thead>
              <tr>
                <th>Dia</th>
                <th>Dia ativo</th>
                <th>Manhã</th>
                <th>Entrada</th>
                <th>Início pausa</th>
                <th>Tarde</th>
                <th>Retorno</th>
                <th>Saída</th>
                <th>Tol. entrada</th>
                <th>Tol. saída</th>
                <th>Alertas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => <tr key={r.weekday}>
                <td><b>{days.find(d => d[0] === r.weekday)?.[1]}</b></td>
                <td>
                  <label className="helptext"><input type="checkbox" checked={!!r.enabled} onChange={e=>patchRow(r.weekday,{enabled:e.target.checked})}/>{r.enabled?' Ativo':' Inativo'}</label>
                </td>
                <td>
                  <label className="helptext"><input type="checkbox" checked={r.morning_enabled !== false} disabled={!r.enabled} onChange={e=>patchRow(r.weekday,{morning_enabled:e.target.checked})}/>{r.morning_enabled !== false?' Ativa':' Inativa'}</label>
                </td>
                <td><input type="time" value={r.entry_time || ''} disabled={!r.enabled || r.morning_enabled === false} onChange={e=>patchRow(r.weekday,{entry_time:e.target.value})}/></td>
                <td><input type="time" value={r.break_start_time || ''} disabled={!r.enabled || r.morning_enabled === false || r.afternoon_enabled !== true} onChange={e=>patchRow(r.weekday,{break_start_time:e.target.value})}/></td>
                <td>
                  <label className="helptext"><input type="checkbox" checked={r.afternoon_enabled === true} disabled={!r.enabled} onChange={e=>patchRow(r.weekday,{afternoon_enabled:e.target.checked})}/>{r.afternoon_enabled === true?' Ativa':' Inativa'}</label>
                </td>
                <td><input type="time" value={r.break_end_time || ''} disabled={!r.enabled || r.afternoon_enabled !== true} onChange={e=>patchRow(r.weekday,{break_end_time:e.target.value})}/></td>
                <td><input type="time" value={r.exit_time || ''} disabled={!r.enabled || (r.morning_enabled === false && r.afternoon_enabled !== true)} onChange={e=>patchRow(r.weekday,{exit_time:e.target.value})}/></td>
                <td><input type="number" min="0" max="120" style={{width:82}} value={r.tolerance_late_minutes ?? 0} disabled={!r.enabled} onChange={e=>patchRow(r.weekday,{tolerance_late_minutes:Number(e.target.value)})}/></td>
                <td><input type="number" min="0" max="120" style={{width:82}} value={r.tolerance_early_minutes ?? 0} disabled={!r.enabled} onChange={e=>patchRow(r.weekday,{tolerance_early_minutes:Number(e.target.value)})}/></td>
                <td>
                  <label className="helptext"><input type="checkbox" checked={r.notify_employee_late !== false} onChange={e=>patchRow(r.weekday,{notify_employee_late:e.target.checked})}/> atraso</label><br/>
                  <label className="helptext"><input type="checkbox" checked={r.notify_employee_missing !== false} onChange={e=>patchRow(r.weekday,{notify_employee_missing:e.target.checked})}/> sem ponto</label><br/>
                  <label className="helptext"><input type="checkbox" checked={r.notify_employee_overtime !== false} onChange={e=>patchRow(r.weekday,{notify_employee_overtime:e.target.checked})}/> extra</label><br/>
                  <label className="helptext"><input type="checkbox" checked={r.notify_company !== false} onChange={e=>patchRow(r.weekday,{notify_company:e.target.checked})}/> empresa</label>
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginTop:12}}>
          <button className="btn green" disabled={saving} onClick={save}>{saving ? 'Salvando...' : 'Salvar jornada'}</button>
          <span className="helptext">Ex.: sábado com somente manhã: Ativo + Manhã Ativa + 08:00–12:00 + Tarde Inativa.</span>
        </div>
      </div>}
    </div>
  );
}


/* ---------------------------- Company ---------------------------- */
function CompanySettings({ companyId, role }: { companyId: string; role: string }) {
  const showToast = useToast();
  const [company, setCompany] = React.useState<any>(null);
  const [saved, setSaved] = React.useState(false);
  const canEdit = ['owner', 'admin'].includes(role);

  React.useEffect(() => {
    load();
  }, [companyId]);
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
      location_verification_enabled: company.location_verification_enabled,
      location_tolerance_m: company.location_tolerance_m,
      employee_alerts_enabled: company.employee_alerts_enabled,
      employee_late_alert_enabled: company.employee_late_alert_enabled,
      employee_missing_alert_enabled: company.employee_missing_alert_enabled,
      employee_overtime_alert_enabled: company.employee_overtime_alert_enabled,
      company_alerts_enabled: company.company_alerts_enabled,
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
          <div className="field"><label>Texto da entrada/presença</label><input value={company.entry_label || ''} onChange={e => setCompany({ ...company, entry_label: e.target.value })} disabled={!canEdit} placeholder="Ex: Bater entrada, Marcar presença" /></div>
          <div className="field"><label>Texto da saída</label><input value={company.exit_label || ''} onChange={e => setCompany({ ...company, exit_label: e.target.value })} disabled={!canEdit || company.presence_mode !== 'both'} /></div>
        </div>
        <p className="helptext" style={{ marginBottom: 14 }}>O tipo de marcação é configurado no menu <b>Modo de presença</b>.</p>
        <h2 style={{ marginTop: 8 }}>Localização e alertas</h2>
        <div className="field"><label>Tolerância de localização (m)</label><input type="number" min="0" max="1000" value={company.location_tolerance_m ?? 0} onChange={e => setCompany({ ...company, location_tolerance_m: Number(e.target.value) })} disabled={!canEdit} /></div>
        <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13.5, marginBottom:8 }}><input type="checkbox" checked={company.location_verification_enabled !== false} onChange={e=>setCompany({ ...company, location_verification_enabled:e.target.checked })} disabled={!canEdit}/> Verificar local autorizado</label>
        <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13.5, marginBottom:8 }}><input type="checkbox" checked={company.employee_alerts_enabled !== false} onChange={e=>setCompany({ ...company, employee_alerts_enabled:e.target.checked })} disabled={!canEdit}/> Alertas para o funcionário</label>
        <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13.5, marginBottom:8 }}><input type="checkbox" checked={company.employee_late_alert_enabled !== false} onChange={e=>setCompany({ ...company, employee_late_alert_enabled:e.target.checked })} disabled={!canEdit}/> Alertas de atraso</label>
        <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13.5, marginBottom:8 }}><input type="checkbox" checked={company.employee_missing_alert_enabled !== false} onChange={e=>setCompany({ ...company, employee_missing_alert_enabled:e.target.checked })} disabled={!canEdit}/> Alertas de falta de registro</label>
        <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13.5, marginBottom:8 }}><input type="checkbox" checked={company.employee_overtime_alert_enabled !== false} onChange={e=>setCompany({ ...company, employee_overtime_alert_enabled:e.target.checked })} disabled={!canEdit}/> Alertas de hora extra</label>
        <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13.5, marginBottom:14 }}><input type="checkbox" checked={company.company_alerts_enabled !== false} onChange={e=>setCompany({ ...company, company_alerts_enabled:e.target.checked })} disabled={!canEdit}/> Alertas para a empresa</label>
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

/* ---------------------------- Presence Mode ---------------------------- */
function PresenceMode({ companyId, role }: { companyId: string; role: string }) {
  const showToast = useToast();
  const [mode, setMode] = React.useState<'entry' | 'exit' | 'both'>('both');
  const [entryLabel, setEntryLabel] = React.useState('Bater entrada');
  const [exitLabel, setExitLabel] = React.useState('Bater saída');
  const [busy, setBusy] = React.useState(false);
  const canEdit = ['owner', 'admin'].includes(role);

  React.useEffect(() => {
    supabase.from('companies').select('presence_mode,exit_enabled,entry_label,exit_label')
      .eq('id', companyId).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const fallback = data.presence_mode || (data.exit_enabled === false ? 'entry' : 'both');
        if (fallback === 'entry' || fallback === 'exit' || fallback === 'both') setMode(fallback);
        setEntryLabel(data.entry_label || 'Bater entrada');
        setExitLabel(data.exit_label || 'Bater saída');
      });
  }, [companyId]);

  async function save() {
    if (!canEdit) return;
    setBusy(true);
    const res = await callFunction('admin-mutate', {
      table: 'companies',
      action: 'update',
      company_id: companyId,
      id: companyId,
      payload: {
        presence_mode: mode,
        exit_enabled: mode === 'both',
        entry_label: entryLabel.trim() || 'Marcar presença',
        exit_label: exitLabel.trim() || 'Bater saída'
      }
    });
    setBusy(false);
    if (!res.ok) {
      alert(friendlyError((res.data as any)?.error));
      return;
    }
    showToast('Modo de presença atualizado.');
  }

  return (
    <div className="card" style={{ maxWidth: 680 }}>
      <h2>Modo de presença e registro</h2>
      <p className="helptext" style={{ marginBottom: 16 }}>
        Defina como este acesso será usado. O sistema aplica a regra escolhida também no servidor, evitando marcações fora do modo configurado.
      </p>

      <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
        <label className="fallback" style={{ display: 'block', cursor: canEdit ? 'pointer' : 'default' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <input type="radio" name="presence-mode" checked={mode === 'entry'} onChange={() => setMode('entry')} disabled={!canEdit} />
            <div>
              <b>Só presença / entrada</b>
              <div className="helptext" style={{ marginTop: 4 }}>Ideal para reunião, evento ou controle simples de presença. Registra uma entrada por pessoa no dia, sem exigir saída.</div>
            </div>
          </div>
        </label>
        <label className="fallback" style={{ display: 'block', cursor: canEdit ? 'pointer' : 'default' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <input type="radio" name="presence-mode" checked={mode === 'exit'} onChange={() => setMode('exit')} disabled={!canEdit} />
            <div>
              <b>Só saída</b>
              <div className="helptext" style={{ marginTop: 4 }}>Útil quando o acesso deve registrar somente a saída.</div>
            </div>
          </div>
        </label>
        <label className="fallback" style={{ display: 'block', cursor: canEdit ? 'pointer' : 'default' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <input type="radio" name="presence-mode" checked={mode === 'both'} onChange={() => setMode('both')} disabled={!canEdit} />
            <div>
              <b>Entrada e saída</b>
              <div className="helptext" style={{ marginTop: 4 }}>Modo normal de jornada. Mantém a sequência Entrada → Saída e, quando houver tarde ativa, Entrada → Saída → Entrada → Saída.</div>
            </div>
          </div>
        </label>
      </div>

      <div className="row2">
        <div className="field"><label>Texto do botão de entrada/presença</label><input value={entryLabel} onChange={e => setEntryLabel(e.target.value)} disabled={!canEdit} /></div>
        <div className="field"><label>Texto do botão de saída</label><input value={exitLabel} onChange={e => setExitLabel(e.target.value)} disabled={!canEdit || mode !== 'both'} /></div>
      </div>

      {mode === 'entry' && (
        <div className="notice" style={{ marginTop: 12 }}>
          <b>Reconhecimento automático para presença</b>
          <div style={{ marginTop: 4 }}>No acesso individual do participante, a câmera será iniciada automaticamente para reconhecer o rosto e registrar a presença. Depois de registrada, não será aberta uma segunda marcação no mesmo dia.</div>
        </div>
      )}

      {mode === 'both' && (
        <div className="notice" style={{ marginTop: 12 }}>
          O cálculo de jornada e saldo continua funcionando normalmente neste modo.
        </div>
      )}

      {canEdit && <button className="btn green" style={{ marginTop: 16 }} disabled={busy} onClick={save}>{busy ? 'Salvando...' : 'Salvar modo de presença'}</button>}
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
