import React from 'react';
import { FUNCTIONS_BASE as FUNCTIONS } from '../lib/supabaseClient';
import { loadFaceModels, detectFace } from '../lib/faceEngine';
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
  location_label?: string | null;
  location_address?: string | null;
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
  const [phase, setPhase] = React.useState<'loading' | 'camera' | 'ready' | 'captured'>('loading');
  const [hint, setHint] = React.useState('Preparando o reconhecimento facial...');
  const rafRef = React.useRef<number | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const doneRef = React.useRef(false);
  const startedAtRef = React.useRef(0);
  const lastFrameAtRef = React.useRef(0);
  const stableFramesRef = React.useRef(0);
  const descriptorsRef = React.useRef<number[][]>([]);
  const runningRef = React.useRef(false);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setPhase('camera');
        setHint('Ligando a câmera...');

        await loadFaceModels();

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'user' },
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 24, max: 30 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;

        if (!video) {
          stream.getTracks().forEach(t => t.stop());
          onCancel('Não foi possível iniciar a câmera.');
          return;
        }

        video.srcObject = stream;
        await video.play();

        if (cancelled) return;

        setPhase('ready');
        setHint('Olhe para a câmera. Mantenha o rosto centralizado; o reconhecimento será automático.');
        startedAtRef.current = Date.now();
        lastFrameAtRef.current = 0;
        loop();
      } catch (error) {
        console.error('face recognition init error', error);
        onCancel('Não foi possível iniciar o reconhecimento facial. Verifique a permissão da câmera.');
      }
    })();

    return () => {
      cancelled = true;
      doneRef.current = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function averageDescriptor(items: number[][]): number[] {
    if (!items.length) return [];
    const len = items[0].length;
    const out = new Array<number>(len).fill(0);
    for (const item of items) {
      for (let i = 0; i < len; i++) out[i] += item[i];
    }
    for (let i = 0; i < len; i++) out[i] /= items.length;

    return out;
  }

  async function finish() {
    if (doneRef.current) return;
    const video = videoRef.current;
    if (!video) return;

    const final = await detectFace(video);
    if (!final) {
      stableFramesRef.current = 0;
      descriptorsRef.current = [];
      setHint('Rosto detectado, mas saiu do enquadramento. Centralize novamente.');
      loop();
      return;
    }

    const samples = [...descriptorsRef.current, Array.from(final.descriptor)].slice(-5);
    const descriptor = averageDescriptor(samples);

    if (descriptor.length !== 128) {
      stableFramesRef.current = 0;
      descriptorsRef.current = [];
      setHint('Não consegui capturar o rosto. Olhe diretamente para a câmera.');
      loop();
      return;
    }

    doneRef.current = true;
    setPhase('captured');
    setHint('Rosto capturado. Confirmando sua identidade...');

    setTimeout(() => onDone({ descriptor }), 120);
  }

  function loop() {
    rafRef.current = requestAnimationFrame(async () => {
      if (doneRef.current || runningRef.current) return;

      const now = Date.now();
      if (now - lastFrameAtRef.current < 220) {
        loop();
        return;
      }
      lastFrameAtRef.current = now;
      runningRef.current = true;

      try {
        const video = videoRef.current;

        if (video && video.readyState >= 2) {
          const result = await detectFace(video);

          if (result) {
            const box = result.box;
            const vw = video.videoWidth || 640;
            const vh = video.videoHeight || 480;
            const cx = box.x + box.width / 2;
            const cy = box.y + box.height / 2;

            const centered =
              box.width >= vw * 0.16 &&
              box.width <= vw * 0.80 &&
              Math.abs(cx - vw / 2) <= vw * 0.22 &&
              Math.abs(cy - vh / 2) <= vh * 0.24;

            if (centered) {
              stableFramesRef.current = Math.min(10, stableFramesRef.current + 1);
              descriptorsRef.current.push(Array.from(result.descriptor));
              if (descriptorsRef.current.length > 5) descriptorsRef.current.shift();

              if (stableFramesRef.current < 3) {
                setHint('Rosto encontrado. Mantenha-se parado por um instante...');
              } else if (stableFramesRef.current < 5) {
                setHint('Reconhecendo seu rosto...');
              } else {
                await finish();
                return;
              }
            } else {
              stableFramesRef.current = Math.max(0, stableFramesRef.current - 1);
              setHint('Centralize o rosto dentro do enquadramento.');
            }
          } else {
            stableFramesRef.current = Math.max(0, stableFramesRef.current - 1);
            setHint('Não estou vendo seu rosto. Aproxime-se e olhe para a câmera.');
          }
        }
      } catch (error) {
        console.debug('face recognition frame error', error);
        setHint('Ajustando a câmera... mantenha o rosto centralizado.');
      } finally {
        runningRef.current = false;
      }

      if (Date.now() - startedAtRef.current > 20000 && !doneRef.current) {
        doneRef.current = true;
        onCancel('Não conseguimos localizar seu rosto. Tente novamente com boa iluminação e o rosto centralizado.');
        return;
      }

      loop();
    });
  }

  return (
    <div className="liveness-page">
      <div className="brand">RMD <span>PontoFace</span></div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 20 }}>
        <div style={{ width: 280, height: 280, borderRadius: '50%', overflow: 'hidden', border: '4px solid #2f9e6e', background: '#000' }}>
          <video ref={videoRef} muted playsInline autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
        </div>
        <p style={{ color: '#fff', fontSize: 15, textAlign: 'center', maxWidth: 320, lineHeight: 1.45 }}>{hint}</p>
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
  const [dashboard, setDashboard] = React.useState<any>(null);
  const [activeAlert, setActiveAlert] = React.useState<any>(null);
  const seenAlertIdsRef = React.useRef<Set<string>>(new Set());
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
    const on = () => { setOnline(true); refreshQueue(); refreshEmployeeDashboard(); };
    const off = () => setOnline(false);
    addEventListener('online', on);
    addEventListener('offline', off);
    refreshQueue();
    refreshEmployeeDashboard();
    const timer = window.setInterval(refreshEmployeeDashboard, 30000);
    return () => {
      removeEventListener('online', on);
      removeEventListener('offline', off);
      window.clearInterval(timer);
    };
  }, [companyId, employeeId, token]);

  async function refreshQueue() { setPending(await queueAll()); }

  async function refreshEmployeeDashboard() {
    if (!token || !employeeId || !companyId) return;
    try {
      const response = await fetch(FUNCTIONS + '/get-employee-dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-employee-access-token': token },
        body: JSON.stringify({ company_id: companyId, employee_id: employeeId })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) return;
      setDashboard(data);
      const alerts = Array.isArray(data.alerts) ? data.alerts : [];
      const newest = alerts.find((a: any) => !seenAlertIdsRef.current.has(a.id));
      if (newest) {
        seenAlertIdsRef.current.add(newest.id);
        setActiveAlert(newest);
        try { navigator.vibrate?.([250, 120, 250]); } catch {}
        try {
          const AC = (window.AudioContext || (window as any).webkitAudioContext);
          if (AC) {
            const audio = new AC();
            const osc = audio.createOscillator();
            const gain = audio.createGain();
            osc.frequency.value = 880;
            gain.gain.value = 0.06;
            osc.connect(gain);
            gain.connect(audio.destination);
            osc.start();
            window.setTimeout(() => { osc.stop(); audio.close(); }, 260);
          }
        } catch {}
      }
    } catch {}
  }

  async function reverseGeocode(latitude: number, longitude: number): Promise<{ label: string | null; address: string | null }> {
    try {
      const url = 'https://photon.komoot.io/reverse?lang=pt&limit=1&lon=' + encodeURIComponent(String(longitude)) + '&lat=' + encodeURIComponent(String(latitude));
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!r.ok) return { label: null, address: null };
      const data = await r.json();
      const p = data?.features?.[0]?.properties || {};
      const street = [p.street, p.housenumber].filter(Boolean).join(', ');
      const neighborhood = p.suburb || p.district || p.locality || '';
      const city = p.city || p.town || p.village || '';
      const state = p.state || '';
      const parts = [street, neighborhood, city, state].filter(Boolean);
      return { label: street || neighborhood || city || null, address: parts.length ? parts.join(' — ') : null };
    } catch {
      return { label: null, address: null };
    }
  }

  async function reverseGeocode(latitude: number, longitude: number): Promise<{ label: string | null; address: string | null }> {
    try {
      const url = 'https://photon.komoot.io/reverse?lang=pt&limit=1&lon=' + encodeURIComponent(String(longitude)) + '&lat=' + encodeURIComponent(String(latitude));
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!r.ok) return { label: null, address: null };
      const data = await r.json();
      const p = data?.features?.[0]?.properties || {};
      const street = [p.street, p.housenumber].filter(Boolean).join(', ');
      const neighborhood = p.suburb || p.district || p.locality || '';
      const city = p.city || p.town || p.village || '';
      const state = p.state || '';
      const parts = [street, neighborhood, city, state].filter(Boolean);
      return { label: street || neighborhood || city || null, address: parts.length ? parts.join(' — ') : null };
    } catch {
      return { label: null, address: null };
    }
  }

  async function getGeolocation(): Promise<{ latitude: number | null; longitude: number | null; accuracy: number | null; location_label: string | null; location_address: string | null }> {
    const empty = { latitude: null, longitude: null, accuracy: null, location_label: null, location_address: null };
    if (!navigator.geolocation) return empty;
    const position = await new Promise<GeolocationPosition | null>(resolve => {
      let best: GeolocationPosition | null = null;
      let finished = false;
      let timer: number | null = null;
      let watchId: number | null = null;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (timer) window.clearTimeout(timer);
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        resolve(best);
      };
      watchId = navigator.geolocation.watchPosition(
        p => {
          if (!best || p.coords.accuracy < best.coords.accuracy) best = p;
          if (p.coords.accuracy != null && p.coords.accuracy <= 25) window.setTimeout(finish, 450);
        },
        () => finish(),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
      );
      timer = window.setTimeout(finish, 6500);
    });
    if (!position) return empty;
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    const accuracy = position.coords.accuracy;
    const place = await reverseGeocode(latitude, longitude);
    return { latitude, longitude, accuracy, location_label: place.label, location_address: place.address };
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
    setMessage('Obtendo localização precisa...');
    const geo = await getGeolocation();
    const p = basePunch(type);
    p.latitude = geo.latitude; p.longitude = geo.longitude; p.location_accuracy_m = geo.accuracy;
    p.location_label = geo.location_label;
    p.location_address = geo.location_address;
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
          location_label: punch.location_label, location_address: punch.location_address,
          client_captured_at: punch.client_captured_at, client_timezone: punch.client_timezone, offline: false,
          liveness_passed: true, descriptor: result.descriptor
        })
      });
      const data = await r.json();
      if (r.ok && data.approved) {
        setMessage(`Ponto confirmado às ${new Date(punch.occurred_at).toLocaleTimeString('pt-BR')}.`);
        await refreshEmployeeDashboard();
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
      {activeAlert && (
        <div className="notice" style={{ marginTop: 16, border: '2px solid #e1a33a', background: '#fff8df' }}>
          <b>Atenção ao horário</b>
          <div style={{ marginTop: 5 }}>{activeAlert.message}</div>
          {activeAlert.alert_type !== 'missing_entry' && <div style={{ marginTop: 4, fontWeight: 800 }}>{Number(activeAlert.minutes_delta) > 0 ? '+' : ''}{Math.round(activeAlert.minutes_delta)} minutos</div>}
          <button className="link" onClick={() => setActiveAlert(null)}>Entendi</button>
        </div>
      )}

      {dashboard?.today && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Resumo de hoje</h2>
          {dashboard.today.schedule ? (
            <>
              <div className="helptext">
                Jornada: {dashboard.today.schedule.entry_time?.slice(0,5)} às {dashboard.today.schedule.exit_time?.slice(0,5)}
                {dashboard.today.schedule.break_start_time && dashboard.today.schedule.break_end_time
                  ? ' • intervalo ' + dashboard.today.schedule.break_start_time.slice(0,5) + '–' + dashboard.today.schedule.break_end_time.slice(0,5)
                  : ''}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 10 }}>
                <div className="kpi"><small>Trabalhado</small><b>{dashboard.today.worked ?? 0} min</b></div>
                <div className="kpi"><small>Saldo</small><b style={{ color: Number(dashboard.today.balance) < 0 ? 'var(--danger)' : 'var(--brand-2)' }}>{dashboard.today.balance == null ? '—' : (Number(dashboard.today.balance) > 0 ? '+' : '') + Math.round(dashboard.today.balance) + ' min'}</b></div>
                <div className="kpi"><small>Status</small><b style={{ fontSize: 15 }}>{dashboard.today.status === 'late_entry' ? 'Atraso' : dashboard.today.status === 'early_exit' ? 'Saída antecipada' : dashboard.today.status === 'overtime' ? 'Hora extra' : dashboard.today.status === 'day_off' ? 'Folga' : 'Normal'}</b></div>
              </div>
            </>
          ) : <div className="helptext">Hoje está configurado como folga ou ainda não há jornada cadastrada.</div>}
        </div>
      )}

      {dashboard?.history?.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Histórico de pontos</h2>
          <table style={{ minWidth: 0 }}>
            <thead><tr><th>Data</th><th>Tipo</th><th>Local</th><th>Precisão</th><th>Saldo</th></tr></thead>
            <tbody>
              {dashboard.history.map((h: any) => (
                <tr key={h.id}>
                  <td>{new Date(h.occurred_at).toLocaleString('pt-BR')}</td>
                  <td>{h.punch_type === 'entry' ? 'Entrada' : 'Saída'}</td>
                  <td>
                    {h.location_label || h.location_address || 'Local não identificado'}
                    {(h.location_address || h.location_label) && <div><a href={'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(h.location_address || h.location_label)} target="_blank" rel="noreferrer" className="helptext">Abrir no mapa</a></div>}
                    {h.location_status === 'inside' && <div className="helptext">Dentro do local autorizado{h.location_distance_m != null ? ' • ' + Math.round(h.location_distance_m) + 'm' : ''}</div>}
                    {h.location_status === 'outside' && <div className="helptext" style={{ color: 'var(--danger)' }}>Fora do raio autorizado{h.location_distance_m != null ? ' • ' + Math.round(h.location_distance_m) + 'm' : ''}</div>}
                  </td>
                  <td>{h.location_accuracy_m != null ? '±' + Math.round(h.location_accuracy_m) + 'm' : '—'}</td>
                  <td style={{ color: Number(h.balance_minutes) < 0 ? 'var(--danger)' : 'var(--brand-2)', fontWeight: 800 }}>{h.balance_minutes == null ? '—' : (Number(h.balance_minutes) > 0 ? '+' : '') + Math.round(h.balance_minutes) + ' min'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="privacy">A localização é capturada no momento da marcação. O sistema não faz rastreamento contínuo.</div>
    </main>
  </div>;
}

export default EmployeePunch;
