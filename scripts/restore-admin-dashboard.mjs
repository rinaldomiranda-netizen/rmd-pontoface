import { writeFile } from 'node:fs/promises';

const rawUrl = 'https://raw.githubusercontent.com/rinaldomiranda-netizen/rmd-pontoface/c593a60fbe5fc13bf59b8d85b25008099c65f9fa/src/pages/AdminDashboard.tsx';
const target = 'src/pages/AdminDashboard.tsx';

const response = await fetch(rawUrl);
if (!response.ok) throw new Error(`Não foi possível restaurar AdminDashboard.tsx: HTTP ${response.status}`);
let source = await response.text();

function replaceOrFail(search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Não encontrei o trecho esperado para: ${label}`);
  source = source.replace(search, replacement);
}

replaceOrFail(
  "  const [section, setSection] = React.useState<Section>('overview');",
  "  const [section, setSection] = React.useState<Section>('overview');\n  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);",
  'estado do menu móvel'
);

replaceOrFail(
  '<div className="admin">',
  '<div className={`admin ${role === \'owner\' ? \'theme-rmd\' : \'theme-company\'}`}>',
  'tema do dashboard'
);

replaceOrFail(
  "          {companyAlerts.length > 0 && (",
  "          {section === 'overview' && companyAlerts.length > 0 && (",
  'alertas somente no dashboard'
);

replaceOrFail(
  "          {section === 'overview' ? <div className=\"mobile-nav\">{nav}</div> : <div className=\"mobile-nav-back\"><button className=\"btn light wide\" onClick={() => setSection('overview')}>← Voltar ao menu</button></div>}",
  "          {section === 'overview' ? (\n            <div className=\"mobile-nav\">\n              <button className=\"mobile-menu-trigger\" aria-label=\"Abrir menu\" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(v => !v)}>☰<span>Menu</span></button>\n              {mobileMenuOpen && <div className=\"mobile-menu-popover\" onClick={() => setMobileMenuOpen(false)}>{nav}</div>}\n            </div>\n          ) : (\n            <div className=\"mobile-nav-back\"><button className=\"btn light wide\" onClick={() => setSection('overview')}>← Voltar ao menu</button></div>\n          )}",
  'menu de três pontos'
);

await writeFile(target, source, 'utf8');
console.log(`AdminDashboard.tsx restaurado de versão íntegra (${source.length} bytes).`);
