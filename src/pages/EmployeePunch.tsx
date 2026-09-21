import React from 'react';
import { FaceLivenessDetector } from '@aws-amplify/ui-react-liveness';
import { ThemeProvider } from '@aws-amplify/ui-react';
import { FUNCTIONS_BASE as FUNCTIONS, AWS_REGION } from '../lib/supabaseClient';
const DB_NAME = 'rmd-pontoface';
const STORE = 'attendance_queue';

type Punch = {
  client_event_id: string;
  idempotency_key: string;
  company_id: string;
  employee_id: string;
  punch_type: 'entry' | 'exit';
  occurred_at: string;
  client_captured_at: string;
  client_timezone: string;
  latitude: number | null;
  longitude: number | null;
  location_accuracy_m: number | null;
  identification_method: 'facial' | 'document';
  offline: boolean;
  liveness_status: 'offline_pending' | 'passed' | 'failed';
  biometric_verification_id?: string;
  sync_status: 'pending' | 'syncing' | 'synced' | 'expired';
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'client_event_id' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function queuePut(item: Punch) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function queueAll(): Promise<Punch[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function queueDelete(id: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function EmployeePunch() {
  const params = new URLSearchParams(location.search);
  const pathMatch = location.pathname.match(/\/funcionario\/([^/]+)/);
  const token = params.get('token') || '';
  const employeeId = (pathMatch && pathMatch[1]) || params.get('employee') || params.get('employee_id') || '';
  const companyId = params.get('company') || params.get('company_id') || '';
  const [employeeName, setEmployeeName] = React.useState('Funcionário');
  const [online, setOnline] = React.useState(navigator.onLine);
  const [mode, setMode] = React.useState<'idle'|'liveness'|'result'|'document'>('idle');
  const [session, setSession] = React.useState<{verification_id:string;session_id:string}|null>(null);
  const [message, setMessage] = React.useState('Pronto para registrar.');
  const [pending, setPending] = React.useState<Punch[]>([]);
  const [punchType, setPunchType] = React.useState<'entry'|'exit'>('entry');
  const [selectedPunch, setSelectedPunch] = React.useState<Punch|null>(null);
  const [document, setDocument] = React.useState('');

  React.useEffect(() => {
    const on = () => { setOnline(true); refreshQueue(); };
    const off = () => setOnline(false);
    addEventListener('online', on); addEventListener('offline', off);
    refreshQueue();
    return () => { removeEventListener('online', on); removeEventListener('offline', off); };
  }, []);

  async function refreshQueue() { setPending(await queueAll()); }

  async function getGeolocation(): Promise<{latitude:number|null;longitude:number|null;accuracy:number|null}> {
    if (!navigator.geolocation) return {latitude:null,longitude:null,accuracy:null};
    return new Promise(resolve => navigator.geolocation.getCurrentPosition(
      p => resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy}),
      () => resolve({latitude:null,longitude:null,accuracy:null}),
      {enableHighAccuracy:true, timeout:10000, maximumAge:0}
    ));
  }

  function basePunch(type: 'entry'|'exit'): Punch {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    return {
      client_event_id: id,
      idempotency_key: id,
      company_id: companyId,
      employee_id: employeeId,
      punch_type: type,
      occurred_at: now,
      client_captured_at: now,
      client_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      latitude: null, longitude: null, location_accuracy_m: null,
      identification_method: 'facial',
      offline: !navigator.onLine,
      liveness_status: 'offline_pending',
      sync_status: 'pending'
    };
  }

  async function startLiveness(type: 'entry'|'exit') {
    if (!token || !employeeId || !companyId) {
      setMessage('Link do funcionário incompleto. Gere novamente o acesso no painel da empresa.');
      return;
    }
    const geo = await getGeolocation();
    const p = basePunch(type);
    p.latitude = geo.latitude; p.longitude = geo.longitude; p.location_accuracy_m = geo.accuracy;
    setSelectedPunch(p);
    if (!navigator.onLine) {
      await queuePut(p); await refreshQueue();
      setMessage('Ponto guardado no aparelho. A validação facial será concluída quando a internet voltar.');
      return;
    }
    setPunchType(type);
    setMessage('Preparando verificação facial...');
    const r = await fetch(`${FUNCTIONS}/start-face-liveness-v2`, {
      method:'POST',
      headers:{'Content-Type':'application/json','x-employee-access-token':token},
      body:JSON.stringify({company_id:companyId,employee_id:employeeId,device_session_id:crypto.randomUUID()})
    });
    const data = await r.json();
    if (!r.ok) {
      setMessage(data.error === 'aws_credentials_not_configured'
        ? 'O motor biométrico ainda precisa ser configurado pela RMD.'
        : `Não foi possível iniciar a biometria: ${data.error || 'erro'}`);
      return;
    }
    setSession(data);
    setMode('liveness');
  }

  async function completeLiveness() {
    if (!session || !selectedPunch) return;
    setMessage('Validando vivacidade e correspondência facial...');
    const r = await fetch(`${FUNCTIONS}/complete-face-liveness-v2`, {
      method:'POST',
      headers:{'Content-Type':'application/json','x-employee-access-token':token},
      body:JSON.stringify({
        verification_id:session.verification_id, session_id:session.session_id,
        company_id:companyId, employee_id:employeeId,
        punch_type:selectedPunch.punch_type, occurred_at:selectedPunch.occurred_at,
        idempotency_key:selectedPunch.idempotency_key, client_event_id:selectedPunch.client_event_id,
        latitude:selectedPunch.latitude, longitude:selectedPunch.longitude,
        location_accuracy_m:selectedPunch.location_accuracy_m,
        client_captured_at:selectedPunch.client_captured_at,
        client_timezone:selectedPunch.client_timezone, offline:false
      })
    });
    const data = await r.json();
    if (r.ok && data.approved) {
      setMode('result');
      setMessage(`Ponto confirmado às ${new Date(selectedPunch.occurred_at).toLocaleTimeString('pt-BR')}.`);
      setSelectedPunch(null); setSession(null);
      return;
    }
    setMode('result');
    setMessage(data.reason === 'face_not_matched'
      ? 'O rosto não corresponde ao cadastro. Tente novamente.'
      : `Biometria não aprovada: ${data.reason || data.error || 'erro'}`);
  }

  async function documentFallback() {
    const value = document.replace(/\D/g,'');
    if (value.length < 4) { setMessage('Informe pelo menos os 4 últimos dígitos cadastrados.'); return; }
    setMessage('A validação por documento será feita pelo fluxo de fallback do servidor.');
    setMode('result');
  }

  const displayText = {
    goodFitCaptionText:'Boa posição',
    tooFarCaptionText:'Afaste um pouco o rosto',
    hintCenterFaceText:'Centralize o rosto',
    startScreenBeginCheckText:'Começar verificação',
    getReadyText:'Prepare-se',
    processingText:'Verificando...',
    tryAgainText:'Tentar novamente',
    cameraAccessText:'Permitir acesso à câmera',
    cancelText:'Cancelar'
  } as any;

  if (mode === 'liveness' && session) {
    return <ThemeProvider>
      <div className="liveness-page">
        <div className="brand">RMD <span>PontoFace</span></div>
        <FaceLivenessDetector
          sessionId={session.session_id}
          region={AWS_REGION}
          displayText={displayText}
          onAnalysisComplete={completeLiveness}
          onError={(e: { state: string }) => {
            setSession(null); setMode('result');
            setMessage(`A verificação foi interrompida: ${e.state}. Inicie uma nova tentativa.`);
          }}
        />
      </div>
    </ThemeProvider>;
  }

  return <div className="app">
    <header className="top"><div className="brand">RMD <span>PontoFace</span></div><span className={online?'online':'offline'}>● {online?'Online':'Offline'}</span></header>
    <main className="employee">
      <div className="identity"><div className="avatar">👤</div><div><small>Funcionário</small><h1>{employeeName}</h1></div></div>
      <div className="clock">{new Date().toLocaleTimeString('pt-BR')}</div>
      <div className="status">{message}</div>
      <div className="actions">
        <button className="primary" onClick={()=>startLiveness('entry')}>✓ Bater entrada</button>
        <button className="secondary" onClick={()=>startLiveness('exit')}>⇥ Bater saída</button>
      </div>
      <button className="link" onClick={()=>setMode('document')}>Problema com o reconhecimento facial</button>
      {mode === 'document' && <div className="fallback">
        <h2>Identificação alternativa</h2>
        <p>Use somente os dígitos cadastrados no seu perfil.</p>
        <input inputMode="numeric" maxLength={11} value={document} onChange={e=>setDocument(e.target.value)} placeholder="Dígitos do documento" />
        <button className="primary" onClick={documentFallback}>Continuar</button>
      </div>}
      {pending.length>0 && <div className="pending"><b>{pending.length} registro(s) aguardando sincronização</b><small>O sistema mantém o horário e a localização originais.</small></div>}
      <div className="privacy">A localização é capturada no momento da marcação. O sistema não faz rastreamento contínuo.</div>
    </main>
  </div>;
}

export default EmployeePunch;
