import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { read, utils } from 'xlsx';

const buffer = readFileSync('CRM_powiaty_FINAL.xlsx');
const wb = read(buffer, { type: 'buffer' });
const ws = wb.Sheets['CRM_ready'];

if (!ws) {
  console.error('Sheet "CRM_ready" not found');
  process.exit(1);
}

const rows = utils.sheet_to_json(ws);
const powiaty = {};

for (const row of rows) {
  const woj = row['Województwo']?.toLowerCase().trim();
  const pow = row['Powiat']?.toLowerCase().trim();
  if (!woj || !pow) continue;
  powiaty[`${woj}/${pow}`] = {
    region: row['Region'],
    handlowiec: row['Handlowiec'],
    baza: row['Baza'],
  };
}

mkdirSync('src/data', { recursive: true });
writeFileSync('src/data/crm-data.json', JSON.stringify({ powiaty }, null, 2));
console.log(`Wrote ${Object.keys(powiaty).length} entries to src/data/crm-data.json`);
