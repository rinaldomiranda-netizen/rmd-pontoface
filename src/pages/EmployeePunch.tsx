import React from 'react';
import { FUNCTIONS_BASE as FUNCTIONS } from '../lib/supabaseClient';
import { loadFaceModels, detectFace, detectFaceLandmarks, averageEAR } from '../lib/faceEngine';
import { usePwaInstall } from '../lib/pwaInstall';

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
  descriptor?: number[];
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

/* ---------------- captura de vivacidade (piscar de olhos) ---------------- */
type LivenessOutcome = { descriptor: number[] };

function LivenessCapture({ onDone, onCancel }: { onDone: (r: LivenessOutcome) => void; onCancel: (msg: string) => void }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = React.useState<'loading' | 'camera' | 'centering' | 'blink' | 'captured'>('loading');
  const [hint, setHint] = React.useState('Carregando o motor de reconhecimento...');
  const rafRef = React.useRef<number | null>(null);
  const phaseRef = React.useRef<'loading' | 'camera' | 'centering' | 'blink' | 'captured'>('loading');
  const streamRef = React.useRef<MediaStream | null>(null);
  const centeredFrames = React.useRef(0);
  const calibrationEars = React.useRef<number[]>([]);
  const baselineRef = React.useRef(0.28);
  const blinkClosedRef = React.useRef(false);
  const closedAtRef = React.useRef(0);
  const startedAtRef = React.useRef(0);
  const doneRef = React.useRef(false);
  const lastDetectionAtRef = React.useRef(0);
  const lastFrameAtRef = React.useRef(0);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        phaseRef.current = 'camera';
        setPhase('camera');
        setHint('Ligando a câmera...');

        const modelsPromise = loadFaceModels();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } },
          audio: false
        });

        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setHint('Carregando o motor de reconhecimento...');
        await modelsPromise;

        if (cancelled) return;

        phaseRef.current = 'centering';
        setPhase('centering');
        setHint('Centralize o rosto e mantenha os olhos abertos.');
        startedAtRef.current = Date.now();
        lastFrameAtRef.current = 0;
        loop();
      } catch {
        onCancel('Não foi possível acessar a câmera. Verifique as permissões do navegador.');
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loop() {
    rafRef.current = requestAnimationFrame(async () => {
      if (doneRef.current) return;

      const now = Date.now();
      // Evita sobrecarregar celulares lentos: uma análise de rosto por ~120 ms.
      if (now - lastFrameAtRef.current < 120) {
        loop();
        return;
      }
      lastFrameAtRef.current = now;

      const video = videoRef.current;

      try {
        if (video && video.readyState >= 2) {
          const result = await detectFaceLandmarks(video);

          if (result) {
            lastDetectionAtRef.current = Date.now();
            centeredFrames.current = Math.min(30, centeredFrames.current + 1);

            const ear = averageEAR(result.landmarks);

            if (phaseRef.current === 'centering' && Number.isFinite(ear) && ear > 0.15) {
              calibrationEars.current.push(ear);
              if (calibrationEars.current.length >= 8) {
                const values = [...calibrationEars.current].sort((a, b) => a - b);
                const trimmed = values.slice(2, -2);
                baselineRef.current = Math.max(
                  0.18,
                  trimmed.reduce((sum, value) => sum + value, 0) / Math.max(1, trimmed.length)
                );
              }
            }

            if (centeredFrames.current >= 10 && phaseRef.current === 'centering') {
              phaseRef.current = 'blink';
              blinkClosedRef.current = false;
              closedAtRef.current = 0;
              setPhase('blink');
              setHint('Agora feche os olhos devagar e abra novamente.');
            }

            if (phaseRef.current === 'blink' && Number.isFinite(ear)) {
              const baseline = Math.max(0.18, baselineRef.current);
              // O fechamento precisa ser claramente menor que a abertura,
              // mas sem exigir um valor absoluto que varie entre aparelhos.
              const closeThreshold = Math.max(0.10, baseline * 0.66);
              const reopenThreshold = Math.max(0.18, baseline * 0.88);

              if (!blinkClosedRef.current) {
                if (ear < closeThreshold) {
                  blinkClosedRef.current = true;
                  closedAtRef.current = Date.now();
                  setHint('Olhos fechados. Agora abra os olhos.');
                }
              } else {
                const closedFor = Date.now() - closedAtRef.current;
                if (ear > reopenThreshold && closedFor >= 80 && closedFor <= 3000) {
                  doneRef.current = true;
                  phaseRef.current = 'captured';
                  setPhase('captured');
                  setHint('Piscada confirmada. Confirmando seu rosto...');

                  const final = await detectFace(video);
                  if (!final) {
                    doneRef.current = false;
                    phaseRef.current = 'blink';
                    setPhase('blink');
                    setHint('Piscada confirmada, mas perdi o rosto. Mantenha o rosto centralizado.');
                    loop();
                    return;
                  }

                  const descriptor = Array.from(final.descriptor);
                  setTimeout(() => onDone({ descriptor }), 180);
                  return;
                }

                if (closedFor > 3000) {
                  blinkClosedRef.current = false;
                  closedAtRef.current = 0;
                  setHint('Vamos tentar novamente: feche os olhos e abra devagar.');
                }
              }
            }
          } else if (Date.now() - lastDetectionAtRef.current > 900) {
            if (phaseRef.current === 'blink') {
              // Não zera imediatamente a etapa da piscada por uma perda breve
              // de detecção, comum em câmeras móveis.
              setHint('Rosto quase perdido. Centralize novamente.');
            } else {
              centeredFrames.current = Math.max(0, centeredFrames.current - 1);
              setHint('Não estou vendo seu rosto. Centralize na câmera.');
            }
          }
        }
      } catch (error) {
        console.debug('liveness frame error', error);
      }

      if (Date.now() - startedAtRef.current > 90000 && !doneRef.current) {
        doneRef.current = true;
        onCancel('Não conseguimos confirmar a piscada em até 90 segundos. Mantenha o rosto centralizado e feche/abra os olhos uma vez.');
        return;
      }

      loop();
    });
  }

  return (
    <div className="liveness-page">
      <div className="brand">RMD <span>PontoFace</span></div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 20 }}>
        <div style={{ width: 260, height: 260, borderRadius: '50%', overflow: 'hidden', border: '4px solid #2f9e6e', background: '#000' }}>
          <video ref={videoRef} muted playsInline autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
        </div>
        <p style={{ color: '#fff', fontSize: 15, textAlign: 'center', maxWidth: 300 }}>{hint}</p>
        <button className="link" style={{ color: '#bbb' }} onClick={() => onCancel('Verificação cancelada.')}>Cancelar</button>
      </div>
    </div>
  );
}


/* ---------------- tela principal do funcionário ---------------- */
function EmployeePunch() {
  const params = new URLSearchParams(location.search);
  const pathMatch = location.pathname.match(/\/funcionario\/([^/]+)/);
  const token = params.get('token') || '';
  const employeeId = (pathMatch && pathMatch[1]) || params.get('employee') || params.get('employee_id') || '';
  const companyId = params.get('company') || params.get('company_id') || '';
  const [employeeName, setEmployeeName] = React.useState('Carregando...');
  const [online, setOnline] = React.useState(navigator.onLine);
  const [mode, setMode] = React.useState<'idle' | 'liveness' | 'document'>('idle');
  const [message, setMessage] = React.useState('Pronto para registrar.');
  const [pending, setPending] = React.useState<Punch[]>([]);
  const [selectedPunch, setSelectedPunch] = React.useState<Punch | null>(null);
  const [documentDigits, setDocumentDigits] = React.useState('');
  const [labels, setLabels] = React.useState({ name: 'RMD PontoFace', person_label: 'Funcionário', entry_label: 'Bater entrada', exit_label: 'Bater saída', exit_enabled: true });
  const pwa = usePwaInstall(`${location.pathname}${location.search}`);

  React.useEffect(() => {
    if (!companyId) return;
    fetch(`${FUNCTIONS}/get-company-labels`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company_id: companyId }) })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setLabels(data); })
      .catch(() => {});
  }, [companyId]);

  React.useEffect(() => {
    let cancelled = false;
    setEmployeeName('Carregando...');

    if (!token || !employeeId || !companyId) {
      setEmployeeName('Funcionário não encontrado.');
      return () => { cancelled = true; };
    }

    (async () => {
      try {
        const response = await fetch(`${FUNCTIONS}/get-employee-profile`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-employee-access-token': token
          },
          body: JSON.stringify({ company_id: companyId, employee_id: employeeId })
        });
        const data = await response.json().catch(() => null);
        const fullName = typeof data?.full_name === 'string'
          ? data.full_name.trim()
          : typeof data?.employee?.full_name === 'string'
            ? data.employee.full_name.trim()
            : '';

        if (cancelled) return;
        if (!response.ok || !fullName) {
          setEmployeeName('Funcionário não encontrado.');
          return;
        }
        setEmployeeName(fullName);
      } catch {
        if (!cancelled) {
          setEmployeeName('Não foi possível carregar o nome.');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [companyId, employeeId, token]);
  React.useEffect(() => {
    const on = () => { setOnline(true); refreshQueue(); };
    const off = () => setOnline(false);
    addEventListener('online', on); addEventListener('offline', off);
    refreshQueue();
    return () => { removeEventListener('online', on); removeEventListener('offline', off); };
  }, []);

  async function refreshQueue() { setPending(await queueAll()); }

  async function getGeolocation(): Promise<{ latitude: number | null; longitude: number | null; accuracy: number | null }> {
    if (!navigator.geolocation) return { latitude: null, longitude: null, accuracy: null };
    return new Promise(resolve => navigator.geolocation.getCurrentPosition(
      p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve({ latitude: null, longitude: null, accuracy: null }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    ));
  }

  function basePunch(type: 'entry' | 'exit'): Punch {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    return {
      client_event_id: id, idempotency_key: id, company_id: companyId, employee_id: employeeId,
      punch_type: type, occurred_at: now, client_captured_at: now,
      client_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      latitude: null, longitude: null, location_accuracy_m: null,
      identification_method: 'facial', offline: !navigator.onLine,
      liveness_status: 'offline_pending', sync_status: 'pending'
    };
  }

  async function startPunch(type: 'entry' | 'exit') {
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
      setMessage('Ponto guardado no aparelho. A confirmação será feita quando a internet voltar.');
      return;
    }
    setMode('liveness');
  }

  async function onLivenessDone(punch: Punch, result: { descriptor: number[] }) {
    setMode('idle');
    setMessage('Confirmando ponto...');
    try {
      const r = await fetch(`${FUNCTIONS}/verify-face-punch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-employee-access-token': token },
        body: JSON.stringify({
          company_id: companyId, employee_id: employeeId,
          punch_type: punch.punch_type, occurred_at: punch.occurred_at,
          idempotency_key: punch.idempotency_key, client_event_id: punch.client_event_id,
          latitude: punch.latitude, longitude: punch.longitude, location_accuracy_m: punch.location_accuracy_m,
          client_captured_at: punch.client_captured_at, client_timezone: punch.client_timezone, offline: false,
          liveness_passed: true, descriptor: result.descriptor
        })
      });
      const data = await r.json();
      if (r.ok && data.approved) {
        setMessage(`Ponto confirmado às ${new Date(punch.occurred_at).toLocaleTimeString('pt-BR')}.`);
      } else if (data.reason === 'face_not_matched') {
        setMessage('O rosto não corresponde ao cadastro. Tente novamente, com boa iluminação.');
      } else if (data.error === 'facial_profile_not_enrolled') {
        setMessage('Seu rosto ainda não foi cadastrado. Fale com a administração.');
      } else {
        setMessage('Não foi possível confirmar o ponto. Tente novamente.');
      }
    } catch {
      setMessage('Falha de conexão ao confirmar o ponto. Tente novamente.');
    }
    setSelectedPunch(null);
  }

  function onLivenessCancel(msg: string) {
    setMode('idle'); setMessage(msg); setSelectedPunch(null);
  }

  async function documentFallback() {
    const value = documentDigits.replace(/\D/g, '');
    if (value.length < 4) { setMessage('Informe pelo menos os 4 últimos dígitos cadastrados.'); return; }
    setMessage('Peça a um administrador para confirmar sua identidade manualmente no painel.');
    setMode('idle');
  }

  if (mode === 'liveness' && selectedPunch) {
    const punch = selectedPunch;
    return <LivenessCapture
      onDone={(r) => onLivenessDone(punch, r)}
      onCancel={onLivenessCancel}
    />;
  }

  return <div className="app">
    <header className="top"><div className="brand">{labels.name.includes('+') ? labels.name : <>RMD <span>PontoFace</span></>}</div><span className={online ? 'online' : 'offline'}>● {online ? 'Online' : 'Offline'}</span></header>
    <main className="employee">
      <div className="identity"><div className="avatar">👤</div><div><small>{labels.person_label}</small><h1>{employeeName}</h1></div></div>
      <div className="clock">{new Date().toLocaleTimeString('pt-BR')}</div>
      <div className="status">{message}</div>
      <div className="actions">
        <button className="primary" onClick={() => startPunch('entry')}>✓ {labels.entry_label}</button>
        {labels.exit_enabled && <button className="secondary" onClick={() => startPunch('exit')}>⇥ {labels.exit_label}</button>}
      </div>
      {!pwa.installed && pwa.canInstall && (
        <button className="secondary" style={{ marginTop: 4 }} onClick={pwa.install}>📲 Instalar na tela inicial</button>
      )}
      {pwa.showIosHint && (
        <div className="fallback">
          <p style={{ margin: 0 }}>No iPhone: toque no ícone de <b>Compartilhar</b> (o quadrado com a seta, na barra do navegador) e depois em <b>"Adicionar à Tela de Início"</b>.</p>
          <button className="link" onClick={() => pwa.setShowIosHint(false)}>Entendi</button>
        </div>
      )}
      <button className="link" onClick={() => setMode('document')}>Problema com o reconhecimento facial</button>
      {mode === 'document' && <div className="fallback">
        <h2>Identificação alternativa</h2>
        <p>Use somente os dígitos cadastrados no seu perfil.</p>
        <input inputMode="numeric" maxLength={11} value={documentDigits} onChange={e => setDocumentDigits(e.target.value)} placeholder="Dígitos do documento" />
        <button className="primary" onClick={documentFallback}>Continuar</button>
      </div>}
      {pending.length > 0 && <div className="pending"><b>{pending.length} registro(s) aguardando sincronização</b><small>O sistema mantém o horário e a localização originais.</small></div>}
      <div className="privacy">A localização é capturada no momento da marcação. O sistema não faz rastreamento contínuo.</div>
    </main>
  </div>;
}

export default EmployeePunch;
