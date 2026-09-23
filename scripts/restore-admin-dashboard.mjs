import { writeFile } from 'node:fs/promises';

const rawUrl = 'https://raw.githubusercontent.com/rinaldomiranda-netizen/rmd-pontoface/32135a305094a636ae1de4abcaa2ef64c52a0870/src/pages/AdminDashboard.tsx';
const target = 'src/pages/AdminDashboard.tsx';

const response = await fetch(rawUrl);
if (!response.ok) throw new Error(`Não foi possível restaurar AdminDashboard.tsx: HTTP ${response.status}`);

let source = await response.text();

function replaceOrFail(search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Não encontrei o trecho esperado para: ${label}`);
  source = source.replace(search, replacement);
}

// Reaplica a correção de cache do dashboard que foi perdida no commit que truncou o arquivo.
replaceOrFail(
  "function Overview({ companyId, companyAlerts }: { companyId: string; companyAlerts: any[] }) {",
  "type OverviewStats = { total: number; working: number; out: number; pending: number; occurrences: number };\nconst overviewStatsCache = new Map<string, OverviewStats>();\n\nfunction Overview({ companyId, companyAlerts }: { companyId: string; companyAlerts: any[] }) {",
  'OverviewStats'
);

replaceOrFail(
  "  const [stats, setStats] = React.useState({ total: 0, working: 0, out: 0, pending: 0, occurrences: 0 });\n  const [loading, setLoading] = React.useState(true);",
  "  const cachedStats = overviewStatsCache.get(companyId);\n  const [stats, setStats] = React.useState<OverviewStats>(cachedStats || { total: 0, working: 0, out: 0, pending: 0, occurrences: 0 });\n  const [loading, setLoading] = React.useState(!cachedStats);",
  'estado inicial do Overview'
);

replaceOrFail(
  "    load();\n    const sync = () => { void load(); };",
  "    void load(true);\n    const sync = () => { void load(false); };",
  'sincronização do Overview'
);

replaceOrFail(
  "  async function load() {\n    setLoading(true);",
  "  async function load(showInitialLoading: boolean) {\n    if (showInitialLoading && !overviewStatsCache.has(companyId)) setLoading(true);",
  'carregamento do Overview'
);

replaceOrFail(
  "    setStats({ total: total || 0, working, out: Math.max(0, (total || 0) - working), pending: pending || 0, occurrences: occurrences || 0 });\n    setLoading(false);",
  "    const nextStats = { total: total || 0, working, out: Math.max(0, (total || 0) - working), pending: pending || 0, occurrences: occurrences || 0 };\n    overviewStatsCache.set(companyId, nextStats);\n    setStats(nextStats);\n    setLoading(false);",
  'persistência das estatísticas'
);

// Reaplica o tema RMD/empresa da versão que estava em produção antes do truncamento.
replaceOrFail(
  '<div className="admin">',
  '<div className={`admin ${role === \'owner\' ? \'theme-rmd\' : \'theme-company\'}`}>',
  'tema do dashboard'
);

await writeFile(target, source, 'utf8');
console.log(`AdminDashboard.tsx restaurado e corrigido (${source.length} bytes).`);
