import * as XLSX from 'xlsx';

/**
 * Parses an Excel ArrayBuffer (from FileReader or fetch) and returns
 * CRM data in the same shape as src/data/crm-data.json.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ powiaty: Record<string, {region: string, handlowiec: string, baza: string}> }}
 */
export function parseExcelData(arrayBuffer) {
  const data = new Uint8Array(arrayBuffer);
  const wb = XLSX.read(data, { type: 'array' });
  const ws = wb.Sheets['CRM_ready'];
  if (!ws) throw new Error('Sheet "CRM_ready" not found in workbook');

  const rows = XLSX.utils.sheet_to_json(ws);
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

  return { powiaty };
}
