import React from 'react';
import { FUNCTIONS_BASE as FUNCTIONS } from '../lib/supabaseClient';
import EmployeePunch from './EmployeePunch';

type PunchRow = {
  id?: string;
  punch_type: string;
  occurred_at: string;
  balance_minutes?: number | null;
  balance_label?: string | null;
  schedule_status?: string | null;
  scheduled_time?: string | null;
  punch_label?: string | null;
};

type Dashboard = {
  employee?: { full_name?: string };
  today?: { rows?: PunchRow[]; balance?: number; worked?: number; schedule?: any };
  history?: PunchRow[];
};

function signed(n: number) {
  if (n > 0) return `+${n} min`;
  if (n < 0) return `${n} min`;
  return '0 min';
}

function tone(n: number) {
  if (n > 0) return { bg: '#e9f8ef', border: '#2f9e6e', text: '#167047' };
  if (n < 0) return { bg: '#fff0f0', border: '#c43d3d', text: '#a92f2f' };
  return { bg: '#f1f3f5', border: '#adb5bd', text: '#495057' };
}

function localTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function addBadge(row: Element, item: PunchRow) {
  const host = row as HTMLElement;
  let badge = host.querySelector('[data-ponto-balance]') as HTMLElement | null;
  if (!badge) {
    badge = document.createElement('div');
    badge.dataset.pontoBalance = '1';
    host.appendChild(badge);
  }
  const n = Number(item.balance_minutes ?? 0);
  const c = tone(n);
  badge.style.cssText = `display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:8px;padding:7px 9px;border:1px solid ${c.border};border-radius:9px;background:${c.bg};color:${c.text};font-size:13px;font-weight:800;line-height:1.25;`;
  const label = item.punch_label || (item.punch_type === 'entry' ? 'Entrada' : 'Saída');
  const expected = item.scheduled_time ? `previsto ${item.scheduled_time}` : 'horário previsto não informado';
  const status = n > 0 ? 'saldo positivo' : n < 0 ? 'saldo negativo' : 'no horário';
  badge.textContent = `${label} • ${expected} • ${signed(n)} • ${status}`;
}

function findCard(root: Element, text: string) {
  return Array.from(root.querySelectorAll('.fallback, details')).find(el => (el.textContent || '').includes(text)) as HTMLElement | undefined;
}

function rowsContainer(card: HTMLElement) {
  return Array.from(card.querySelectorAll('div')).find(el => getComputedStyle(el).display === 'grid' && el.children.length > 0) as HTMLElement | undefined;
}

function decorateRows(card: HTMLElement | undefined, rows: PunchRow[]) {
  if (!card) return;
  const grid = rowsContainer(card);
  if (!grid) return;
  const children = Array.from(grid.children);
  rows.forEach((item, index) => {
    const row = children[index];
    if (!row) return;
    addBadge(row, item);
  });
}

function updateSummary(root: HTMLElement, dashboard: Dashboard) {
  const card = findCard(root, 'Resumo de hoje');
  if (!card || !dashboard.today) return;
  let panel = card.querySelector('[data-ponto-balance-summary]') as HTMLElement | null;
  if (!panel) {
    panel = document.createElement('div');
    panel.dataset.pontoBalanceSummary = '1';
    card.appendChild(panel);
  }

  const rows = Array.isArray(dashboard.today.rows) ? dashboard.today.rows : [];
  const schedule = dashboard.today.schedule || {};
  const afternoon = schedule.afternoon_enabled === true;
  const expectedSlots = afternoon
    ? [
        { label: 'Entrada manhã', time: schedule.entry_time },
        { label: 'Saída almoço', time: schedule.break_start_time },
        { label: 'Entrada tarde', time: schedule.break_end_time },
        { label: 'Saída tarde', time: schedule.exit_time },
      ]
    : [
        { label: 'Entrada', time: schedule.entry_time },
        { label: 'Saída', time: schedule.exit_time },
      ];

  const total = Number(dashboard.today.balance ?? rows.reduce((sum, r) => sum + Number(r.balance_minutes || 0), 0));
  const c = tone(total);
  panel.style.cssText = 'margin-top:12px;padding:10px 11px;border:1px solid var(--border);border-radius:11px;background:var(--surface, #fff);';

  const header = `<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;font-weight:900"><span>Saldo das batidas</span><span style="color:${c.text}">${signed(total)}</span></div>`;
  const details = expectedSlots.map((slot, index) => {
    const item = rows[index];
    if (!item) return `<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid var(--border);font-size:13px"><span>${slot.label}<small style="display:block;opacity:.65">${slot.time ? String(slot.time).slice(0,5) : '--:--'} previsto</small></span><b style="color:#777">Aguardando</b></div>`;
    const n = Number(item.balance_minutes || 0);
    const tc = tone(n);
    return `<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid var(--border);font-size:13px"><span>${item.punch_label || slot.label}<small style="display:block;opacity:.65">${localTime(item.occurred_at)} • previsto ${item.scheduled_time || (slot.time ? String(slot.time).slice(0,5) : '--:--')}</small></span><b style="color:${tc.text}">${signed(n)}</b></div>`;
  }).join('');
  panel.innerHTML = header + details;
}

function decorateHistory(root: HTMLElement, dashboard: Dashboard) {
  const card = findCard(root, 'Histórico anterior');
  if (!card) return;
  const todayIds = new Set((dashboard.today?.rows || []).map(r => r.id).filter(Boolean));
  const rows = (dashboard.history || []).filter(r => !r.id || !todayIds.has(r.id));
  decorateRows(card, rows);
}

function EmployeePunchBalance() {
  const params = new URLSearchParams(location.search);
  const match = location.pathname.match(/\/funcionario\/([^/]+)/);
  const token = params.get('token') || '';
  const employeeId = (match && match[1]) || params.get('employee') || params.get('employee_id') || '';
  const companyId = params.get('company') || params.get('company_id') || '';
  const [dashboard, setDashboard] = React.useState<Dashboard | null>(null);

  React.useEffect(() => {
    let stopped = false;
    const load = async () => {
      if (!token || !employeeId || !companyId || !navigator.onLine) return;
      try {
        const r = await fetch(FUNCTIONS + '/get-employee-dashboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-employee-access-token': token },
          body: JSON.stringify({ company_id: companyId, employee_id: employeeId }),
        });
        const data = await r.json().catch(() => null);
        if (!stopped && r.ok && data) setDashboard(data);
      } catch {}
    };
    load();
    const timer = window.setInterval(load, 4000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [token, employeeId, companyId]);

  React.useEffect(() => {
    if (!dashboard) return;
    let stopped = false;
    const decorate = () => {
      if (stopped) return;
      const root = document.querySelector('.theme-employee') as HTMLElement | null;
      if (!root) return;
      updateSummary(root, dashboard);
      decorateRows(findCard(root, 'Pontos de hoje'), dashboard.today?.rows || []);
      decorateHistory(root, dashboard);
    };
    decorate();
    const timer = window.setInterval(decorate, 1500);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [dashboard]);

  return <EmployeePunch />;
}

export default EmployeePunchBalance;
