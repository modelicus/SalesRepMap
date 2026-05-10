import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { parseExcelData } from './parseExcel';

// Convert Node Buffer to ArrayBuffer (matches what FileReader gives in browser)
const nodeBuffer = readFileSync('CRM_powiaty_FINAL.xlsx');
const arrayBuffer = nodeBuffer.buffer.slice(
  nodeBuffer.byteOffset,
  nodeBuffer.byteOffset + nodeBuffer.byteLength
);

describe('parseExcelData', () => {
  it('returns an object with a powiaty key', () => {
    const result = parseExcelData(arrayBuffer);
    expect(result).toHaveProperty('powiaty');
    expect(typeof result.powiaty).toBe('object');
  });

  it('parses 380 entries', () => {
    const result = parseExcelData(arrayBuffer);
    expect(Object.keys(result.powiaty).length).toBe(380);
  });

  it('correctly parses dolnośląskie/wrocław', () => {
    const result = parseExcelData(arrayBuffer);
    expect(result.powiaty['dolnośląskie/wrocław']).toEqual({
      region: 'Południe',
      handlowiec: 'Handlowiec 3',
      baza: 'Rybnik',
    });
  });

  it('uses fully lowercase keys', () => {
    const result = parseExcelData(arrayBuffer);
    const keys = Object.keys(result.powiaty);
    expect(keys.every(k => k === k.toLowerCase())).toBe(true);
  });

  it('throws when CRM_ready sheet is missing', () => {
    expect(() => parseExcelData(new ArrayBuffer(10))).toThrow('CRM_ready');
  });
});
