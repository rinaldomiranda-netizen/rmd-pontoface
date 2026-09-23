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
type OverviewStats = { total: number; working: number; out: number; pending: number; occurrences: number };
const overviewStatsCache = new Map<string, OverviewStats>();

function Overview({ companyId, companyAlerts }: { companyId: string; companyAlerts: any[] }) {
  const cachedStats = overviewStatsCache.get(companyId);
  const [stats, setStats] = React.useState<OverviewStats>(cachedStats || { total: 0, working: 0, out: 0, pending: 0, occurrences: 0 });
  const [loading, setLoading] = React.useState(!cachedStats);

  React.useEffect(() => {
    void load(true);
    const sync = () => { void load(false); };
    window.addEventListener('rmd:company-sync', sync);
    return () => window.removeEventListener('rmd:company-sync', sync);
  }, [companyId]);

  async function load(showInitialLoading: boolean) {
    if (showInitialLoading && !overviewStatsCache.has(companyId)) setLoading(true);
    const { count: total } = await supabase.from('employees').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('active', true);
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const { data: todays } = await supabase.from('attendance_records').select('employee_id,punch_type,occurred_at').eq('company_id', companyId).gte('occurred_at', startOfDay.toISOString()).order('occurred_at', { ascending: false });
    const lastByEmployee = new Map<string, string>();
    (todays || []).forEach(r => { if (!lastByEmployee.has(r.employee_id)) lastByEmployee.set(r.employee_id, r.punch_type); });
    const working = [...lastByEmployee.values()].filter(v => v === 'entry').length;
    const { count: pending } = await supabase.from('attendance_records').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('sync_status', 'pending');
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count: occurrences } = await supabase.from('attendance_attempts').select('id', { count: 'exact', head: true }).eq('company_id', companyId).neq('result', 'success').gte('attempted_at', since);
    const nextStats = { total: total || 0, working, out: Math.max(0, (total || 0) - working), pending: pending || 0, occurrences: occurrences || 0 };
    overviewStatsCache.set(companyId, nextStats);
    setStats(nextStats);
    if (!overviewStatsCache.has(companyId)) setLoading(false);
    else setLoading(false);
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
            <div className="field" style={{ maxWidth: 180 }}><label>Últimos ... (truncated)