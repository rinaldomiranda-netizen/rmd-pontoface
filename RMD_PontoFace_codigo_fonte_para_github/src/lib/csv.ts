// Leitor de CSV simples (aceita campos entre aspas com vírgula dentro).
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };
  const clean = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',' || c === ';') pushField();
      else if (c === '\n') pushRow();
      else field += c;
    }
  }
  if (field.length || row.length) pushRow();
  const filtered = rows.filter(r => r.some(c => c.trim().length));
  if (!filtered.length) return [];
  const header = filtered[0].map(h => h.trim().toLowerCase());
  return filtered.slice(1).map(r => {
    const obj: Record<string, string> = {};
    header.forEach((h, i) => { obj[h] = (r[i] || '').trim(); });
    return obj;
  });
}

const FIELD_ALIASES: Record<string, string[]> = {
  full_name: ['full_name', 'nome', 'nome completo', 'name'],
  registration_code: ['registration_code', 'matricula', 'matrícula', 'codigo', 'código', 'id'],
  job_title: ['job_title', 'cargo', 'funcao', 'função'],
  department: ['department', 'departamento', 'setor'],
  document_last4: ['document_last4', 'documento', 'cpf', 'rg']
};

export function normalizeImportRow(raw: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const key = Object.keys(raw).find(k => aliases.includes(k));
    if (key) out[field] = raw[key];
  }
  return out;
}
