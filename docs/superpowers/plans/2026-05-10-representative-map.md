# Representative Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Vite + React app that renders an accurate SVG map of Poland's sales representative regions from Excel data, and exports it as SVG or PNG.

**Architecture:** D3.js renders GeoJSON powiat boundaries as colored SVG paths. Two render modes: an interactive web view with hover tooltips, and a print-ready export view with all county labels and a legend panel. Export serializes the SVG DOM directly (SVG) or rasterizes to canvas (PNG) — no screenshot libraries needed.

**Tech Stack:** Vite 5, React 18, D3 v7, SheetJS (xlsx), Vitest

---

## File Map

| File | Purpose |
|------|---------|
| `scripts/process-excel.js` | Node script: `CRM_powiaty_FINAL.xlsx` → `src/data/crm-data.json` |
| `public/poland-powiaty.geojson` | GADM Poland Level 2 powiat boundaries |
| `public/poland-voivodeships.geojson` | GADM Poland Level 1 voivodeship boundaries |
| `src/data/crm-data.json` | Pre-processed CRM data (committed to repo) |
| `src/lib/matchCounties.js` | GeoJSON feature ↔ CRM data matching logic |
| `src/lib/matchCounties.test.js` | Unit tests for matching |
| `src/lib/parseExcel.js` | Browser-side `.xlsx` → CRM data JSON |
| `src/lib/parseExcel.test.js` | Unit tests using actual Excel file |
| `src/lib/exportMap.js` | SVG serialization and PNG canvas export |
| `src/components/MapView.jsx` | Interactive D3 SVG map (web view) |
| `src/components/ExportView.jsx` | Print-ready D3 SVG map (export view) |
| `src/components/Controls.jsx` | File upload, scale selector, export buttons |
| `src/App.jsx` | Root: state, GeoJSON fetch, layout |
| `index.html` | Page title |
| `vite.config.js` | Vite + Vitest config |

---

## Task 1: Initialize Vite + React Project

**Files:**
- Create: `package.json`, `vite.config.js`, `index.html`, `src/main.jsx`, `src/App.jsx`, `src/index.css`

- [ ] **Step 1: Scaffold Vite React project in current directory**

```bash
npm create vite@latest . -- --template react
```

When prompted "Current directory is not empty. Remove existing files and continue?", select **Yes**.

- [ ] **Step 2: Install core dependencies**

```bash
npm install d3 xlsx
npm install -D vitest jsdom
```

- [ ] **Step 3: Replace vite.config.js with test settings**

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
  },
});
```

- [ ] **Step 4: Update scripts in package.json**

Merge these into the existing `scripts` section (keep `dev`, `build`, `preview`):

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "process-data": "node scripts/process-excel.js"
  }
}
```

- [ ] **Step 5: Clean up default template**

Replace `src/App.jsx`:

```jsx
export default function App() {
  return <div style={{ padding: 20 }}>Loading...</div>;
}
```

Replace `src/index.css`:

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, sans-serif; background: #f5f5f5; }
```

Delete these files (they're unused):
- `src/App.css`
- `src/assets/react.svg`
- `public/vite.svg`

- [ ] **Step 6: Verify dev server starts**

```bash
npm run dev
```

Expected: Server at `http://localhost:5173`, page shows "Loading..."

- [ ] **Step 7: Commit**

```bash
git init
git add .
git commit -m "feat: initialize Vite + React project"
```

---

## Task 2: Download GeoJSON Boundary Data

**Files:**
- Create: `public/poland-powiaty.geojson`
- Create: `public/poland-voivodeships.geojson`

- [ ] **Step 1: Download Level 2 (powiaty — county boundaries)**

```bash
curl -L "https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_POL_2.json.zip" -o /tmp/gadm_pol2.zip
unzip -o /tmp/gadm_pol2.zip -d /tmp/gadm_pol2/
cp /tmp/gadm_pol2/gadm41_POL_2.json public/poland-powiaty.geojson
```

- [ ] **Step 2: Download Level 1 (voivodeships — province boundaries)**

```bash
curl -L "https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_POL_1.json.zip" -o /tmp/gadm_pol1.zip
unzip -o /tmp/gadm_pol1.zip -d /tmp/gadm_pol1/
cp /tmp/gadm_pol1/gadm41_POL_1.json public/poland-voivodeships.geojson
```

- [ ] **Step 3: Verify GeoJSON structure**

```bash
node -e "
const fs = require('fs');
const gj = JSON.parse(fs.readFileSync('public/poland-powiaty.geojson'));
console.log('Features:', gj.features.length);
console.log('Sample NAME_1:', gj.features[0].properties.NAME_1);
console.log('Sample NAME_2:', gj.features[0].properties.NAME_2);
const gv = JSON.parse(fs.readFileSync('public/poland-voivodeships.geojson'));
console.log('Voivodeships:', gv.features.length);
"
```

Expected: `Features:` around 380, voivodeships = 16. NAME_1 is a voivodeship name (Polish), NAME_2 is a powiat name.

- [ ] **Step 4: Commit**

```bash
git add public/poland-powiaty.geojson public/poland-voivodeships.geojson
git commit -m "feat: add GADM Poland Level 1 and Level 2 GeoJSON boundary data"
```

---

## Task 3: Build-Time Excel Processor

**Files:**
- Create: `scripts/process-excel.js`
- Create: `src/data/crm-data.json`

- [ ] **Step 1: Create the processor script**

```bash
mkdir -p scripts src/data
```

Create `scripts/process-excel.js`:

```javascript
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
```

- [ ] **Step 2: Run the processor**

```bash
npm run process-data
```

Expected output: `Wrote 380 entries to src/data/crm-data.json`

- [ ] **Step 3: Spot-check the output**

```bash
node -e "
const data = require('./src/data/crm-data.json');
console.log('Total keys:', Object.keys(data.powiaty).length);
console.log('Wrocław:', JSON.stringify(data.powiaty['dolnośląskie/wrocław']));
console.log('Rumia region sample:', Object.entries(data.powiaty).find(([,v]) => v.baza === 'Rumia'));
"
```

Expected: Total = 380, Wrocław = `{ region: 'Południe', handlowiec: 'Handlowiec 3', baza: 'Rybnik' }`

- [ ] **Step 4: Commit**

```bash
git add scripts/process-excel.js src/data/crm-data.json
git commit -m "feat: add Excel-to-JSON build script and generated CRM data"
```

---

## Task 4: County Name Matcher (TDD)

**Files:**
- Create: `src/lib/matchCounties.js`
- Create: `src/lib/matchCounties.test.js`

- [ ] **Step 1: Create lib directory and write failing tests**

```bash
mkdir -p src/lib
```

Create `src/lib/matchCounties.test.js`:

```javascript
import { describe, it, expect, vi } from 'vitest';
import { normalize, stripSuffix, buildFeatureMap } from './matchCounties';

describe('normalize', () => {
  it('lowercases and trims whitespace', () => {
    expect(normalize('  Wrocław  ')).toBe('wrocław');
  });
  it('collapses internal whitespace', () => {
    expect(normalize('Jelenia  Góra')).toBe('jelenia góra');
  });
});

describe('stripSuffix', () => {
  it('strips -ski', () => {
    expect(stripSuffix('puławski')).toBe('puław');
  });
  it('strips -dzki', () => {
    expect(stripSuffix('łódzki')).toBe('łód');
  });
  it('leaves city names without suffix untouched', () => {
    expect(stripSuffix('wrocław')).toBe('wrocław');
  });
});

describe('buildFeatureMap', () => {
  const crmData = {
    powiaty: {
      'dolnośląskie/wrocław': { region: 'Południe', handlowiec: 'Handlowiec 3', baza: 'Rybnik' },
      'dolnośląskie/bolesławiecki': { region: 'Centrum', handlowiec: 'Handlowiec 2', baza: 'Łódź' },
      'mazowieckie/warszawa': { region: 'Centrum', handlowiec: 'Handlowiec 2', baza: 'Łódź' },
    }
  };

  const cityFeature = { properties: { NAME_1: 'Dolnośląskie', NAME_2: 'Wrocław' } };
  const ruralFeature = { properties: { NAME_1: 'Dolnośląskie', NAME_2: 'Bolesławiecki' } };
  const warsawFeature = { properties: { NAME_1: 'Mazowieckie', NAME_2: 'Warszawa' } };
  const unknownFeature = { properties: { NAME_1: 'Dolnośląskie', NAME_2: 'Nieznany' } };

  const geojson = { features: [cityFeature, ruralFeature, warsawFeature, unknownFeature] };

  it('matches city powiaty by exact normalized name', () => {
    const map = buildFeatureMap(geojson, crmData);
    expect(map.get(cityFeature)).toEqual({ region: 'Południe', handlowiec: 'Handlowiec 3', baza: 'Rybnik' });
  });

  it('matches rural powiaty case-insensitively', () => {
    const map = buildFeatureMap(geojson, crmData);
    expect(map.get(ruralFeature)).toEqual({ region: 'Centrum', handlowiec: 'Handlowiec 2', baza: 'Łódź' });
  });

  it('matches capital city (Warszawa)', () => {
    const map = buildFeatureMap(geojson, crmData);
    expect(map.get(warsawFeature)).toEqual({ region: 'Centrum', handlowiec: 'Handlowiec 2', baza: 'Łódź' });
  });

  it('returns null and warns for unmatched features', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const map = buildFeatureMap(geojson, crmData);
    expect(map.get(unknownFeature)).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('dolnośląskie/nieznany'));
    consoleSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test
```

Expected: FAIL — `Cannot find module './matchCounties'`

- [ ] **Step 3: Implement matchCounties**

Create `src/lib/matchCounties.js`:

```javascript
// Manual aliases for edge cases found at runtime.
// Key: normalized GADM composite (woj/pow). Value: normalized Excel key.
const ALIASES = {
  // Add entries here if console.warn logs unmatched counties at runtime.
  // Example: 'świętokrzyskie/kielecki': 'świętokrzyskie/kielce',
};

export function normalize(str) {
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function stripSuffix(name) {
  return name.replace(/(ski|cki|dzki|ecki)$/, '');
}

function matchFeature(feature, lookup) {
  const woj = normalize(feature.properties.NAME_1);
  const pow = normalize(feature.properties.NAME_2);
  const exactKey = `${woj}/${pow}`;

  // 1. Exact match
  if (lookup.has(exactKey)) return lookup.get(exactKey);

  // 2. Manual alias
  if (ALIASES[exactKey] && lookup.has(ALIASES[exactKey])) return lookup.get(ALIASES[exactKey]);

  // 3. Fuzzy: strip adjectival suffix and retry
  const powBase = stripSuffix(pow);
  for (const [key, value] of lookup.entries()) {
    const slash = key.indexOf('/');
    const keyWoj = key.slice(0, slash);
    const keyPow = key.slice(slash + 1);
    if (keyWoj === woj && stripSuffix(keyPow) === powBase) return value;
  }

  console.warn(`Unmatched county: ${exactKey}`);
  return null;
}

export function buildFeatureMap(geojson, crmData) {
  const lookup = new Map(Object.entries(crmData.powiaty));
  const featureMap = new Map();
  for (const feature of geojson.features) {
    featureMap.set(feature, matchFeature(feature, lookup));
  }
  return featureMap;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchCounties.js src/lib/matchCounties.test.js
git commit -m "feat: add county name matcher with TDD"
```

---

## Task 5: Browser Excel Parser (TDD)

**Files:**
- Create: `src/lib/parseExcel.js`
- Create: `src/lib/parseExcel.test.js`

- [ ] **Step 1: Write failing tests**

Create `src/lib/parseExcel.test.js`:

```javascript
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test
```

Expected: FAIL — `Cannot find module './parseExcel'`

- [ ] **Step 3: Implement parseExcel**

Create `src/lib/parseExcel.js`:

```javascript
import * as XLSX from 'xlsx';

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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/parseExcel.js src/lib/parseExcel.test.js
git commit -m "feat: add browser Excel parser with TDD"
```

---

## Task 6: App Shell + Controls Component

**Files:**
- Modify: `src/App.jsx`
- Create: `src/components/Controls.jsx`

- [ ] **Step 1: Create components directory**

```bash
mkdir -p src/components
```

- [ ] **Step 2: Write Controls component**

Create `src/components/Controls.jsx`:

```jsx
export function Controls({ scale, onScaleChange, onFileUpload, onExportSVG, onExportPNG }) {
  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onFileUpload(ev.target.result);
    reader.readAsArrayBuffer(file);
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '10px 16px', background: '#fff',
      borderBottom: '1px solid #ddd', flexShrink: 0,
    }}>
      <label style={{ fontSize: '14px', fontWeight: 500 }}>
        Upload Excel:
        <input type="file" accept=".xlsx" onChange={handleFile} style={{ marginLeft: '8px' }} />
      </label>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '14px', fontWeight: 500 }}>Export scale:</span>
        {[1, 2, 3].map(s => (
          <button
            key={s}
            onClick={() => onScaleChange(s)}
            style={{
              padding: '4px 10px', border: 'none', borderRadius: '4px', cursor: 'pointer',
              background: scale === s ? '#4a90d9' : '#eee',
              color: scale === s ? '#fff' : '#333',
              fontWeight: scale === s ? 600 : 400,
            }}
          >
            {s}x
          </button>
        ))}
      </div>

      <button
        onClick={onExportSVG}
        style={{ padding: '6px 14px', background: '#2ecc71', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 500 }}
      >
        Download SVG
      </button>

      <button
        onClick={onExportPNG}
        style={{ padding: '6px 14px', background: '#e67e22', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 500 }}
      >
        Download PNG
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Write App.jsx with state management**

Replace `src/App.jsx`:

```jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { Controls } from './components/Controls';
import { parseExcelData } from './lib/parseExcel';
import { buildFeatureMap } from './lib/matchCounties';
import defaultCrmData from './data/crm-data.json';

export default function App() {
  const [geojsonPowiaty, setGeojsonPowiaty] = useState(null);
  const [geojsonVoiv, setGeojsonVoiv] = useState(null);
  const [crmData, setCrmData] = useState(defaultCrmData);
  const [featureMap, setFeatureMap] = useState(null);
  const [scale, setScale] = useState(1);
  const exportSvgRef = useRef(null);

  useEffect(() => {
    Promise.all([
      fetch('/poland-powiaty.geojson').then(r => r.json()),
      fetch('/poland-voivodeships.geojson').then(r => r.json()),
    ]).then(([powiaty, voiv]) => {
      setGeojsonPowiaty(powiaty);
      setGeojsonVoiv(voiv);
    });
  }, []);

  useEffect(() => {
    if (geojsonPowiaty && crmData) {
      setFeatureMap(buildFeatureMap(geojsonPowiaty, crmData));
    }
  }, [geojsonPowiaty, crmData]);

  const handleFileUpload = useCallback((arrayBuffer) => {
    try {
      setCrmData(parseExcelData(arrayBuffer));
    } catch (e) {
      alert(`Failed to parse Excel file: ${e.message}`);
    }
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Controls
        scale={scale}
        onScaleChange={setScale}
        onFileUpload={handleFileUpload}
        onExportSVG={() => {/* wired in Task 9 */}}
        onExportPNG={() => {/* wired in Task 9 */}}
      />
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {featureMap
          ? <p style={{ padding: 20 }}>Map ready — {geojsonPowiaty.features.length} counties loaded.</p>
          : <p style={{ padding: 20 }}>Loading map data...</p>
        }
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify in browser**

```bash
npm run dev
```

Expected: Controls bar renders (upload input, scale buttons, SVG/PNG buttons). Console may show GeoJSON fetch complete.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/components/Controls.jsx
git commit -m "feat: add app shell with state management and controls bar"
```

---

## Task 7: MapView — Interactive Web View

**Files:**
- Create: `src/components/MapView.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Write MapView component**

Create `src/components/MapView.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

const REGION_COLORS = {
  'Północ': '#4a90d9',
  'Centrum': '#6ab04c',
  'Południe': '#f0a500',
};

const CAPITALS = [
  { name: 'Warszawa', coords: [21.0122, 52.2297] },
  { name: 'Kraków', coords: [19.9445, 50.0647] },
  { name: 'Gdańsk', coords: [18.6466, 54.3520] },
  { name: 'Wrocław', coords: [17.0385, 51.1079] },
  { name: 'Poznań', coords: [16.9252, 52.4064] },
  { name: 'Łódź', coords: [19.4560, 51.7592] },
  { name: 'Szczecin', coords: [14.5528, 53.4285] },
  { name: 'Bydgoszcz', coords: [18.0084, 53.1235] },
  { name: 'Lublin', coords: [22.5684, 51.2465] },
  { name: 'Białystok', coords: [23.1688, 53.1325] },
  { name: 'Katowice', coords: [19.0238, 50.2649] },
  { name: 'Rzeszów', coords: [22.0040, 50.0413] },
  { name: 'Olsztyn', coords: [20.4801, 53.7784] },
  { name: 'Zielona Góra', coords: [15.5062, 51.9356] },
  { name: 'Opole', coords: [17.9213, 50.6751] },
  { name: 'Kielce', coords: [20.6286, 50.8661] },
];

export function MapView({ geojsonPowiaty, geojsonVoiv, featureMap }) {
  const svgRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);

  useEffect(() => {
    if (!geojsonPowiaty || !geojsonVoiv || !featureMap || !svgRef.current) return;

    const container = svgRef.current.parentElement;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);
    svg.selectAll('*').remove();

    const projection = d3.geoMercator().fitSize([width, height], geojsonPowiaty);
    const path = d3.geoPath().projection(projection);

    // County polygons
    svg.append('g')
      .selectAll('path')
      .data(geojsonPowiaty.features)
      .join('path')
      .attr('d', path)
      .attr('fill', d => {
        const entry = featureMap.get(d);
        return entry ? REGION_COLORS[entry.region] : '#ccc';
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 0.4)
      .on('mousemove', (event, d) => {
        const entry = featureMap.get(d);
        setTooltip({
          x: event.clientX, y: event.clientY,
          county: d.properties.NAME_2,
          voiv: d.properties.NAME_1,
          region: entry?.region ?? '—',
          handlowiec: entry?.handlowiec ?? '—',
          baza: entry?.baza ?? '—',
        });
      })
      .on('mouseleave', () => setTooltip(null));

    // Voivodeship border overlay
    svg.append('g')
      .selectAll('path')
      .data(geojsonVoiv.features)
      .join('path')
      .attr('d', path)
      .attr('fill', 'none')
      .attr('stroke', '#333')
      .attr('stroke-width', 1.5)
      .attr('pointer-events', 'none');

    // Voivodeship name labels
    svg.append('g')
      .selectAll('text')
      .data(geojsonVoiv.features)
      .join('text')
      .attr('x', d => path.centroid(d)[0])
      .attr('y', d => path.centroid(d)[1])
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', 11)
      .attr('font-weight', '600')
      .attr('fill', '#222')
      .attr('pointer-events', 'none')
      .text(d => d.properties.NAME_1);

    // Capital city dots
    svg.append('g')
      .selectAll('circle')
      .data(CAPITALS)
      .join('circle')
      .attr('cx', d => projection(d.coords)[0])
      .attr('cy', d => projection(d.coords)[1])
      .attr('r', 4)
      .attr('fill', '#111')
      .attr('pointer-events', 'none');

    // Capital city labels
    svg.append('g')
      .selectAll('text')
      .data(CAPITALS)
      .join('text')
      .attr('x', d => projection(d.coords)[0] + 6)
      .attr('y', d => projection(d.coords)[1] + 4)
      .attr('font-size', 11)
      .attr('font-weight', '700')
      .attr('fill', '#111')
      .attr('pointer-events', 'none')
      .text(d => d.name);

  }, [geojsonPowiaty, geojsonVoiv, featureMap]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg ref={svgRef} style={{ display: 'block' }} />
      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x + 14, top: tooltip.y - 10,
          background: 'rgba(0,0,0,0.85)', color: '#fff',
          padding: '8px 12px', borderRadius: '6px', fontSize: '13px',
          pointerEvents: 'none', lineHeight: '1.6', zIndex: 1000,
        }}>
          <div><strong>{tooltip.county}</strong></div>
          <div style={{ color: '#ccc' }}>{tooltip.voiv}</div>
          <div>Region: {tooltip.region}</div>
          <div>Handlowiec: {tooltip.handlowiec}</div>
          <div>Baza: {tooltip.baza}</div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire MapView into App.jsx**

Add import at top of `src/App.jsx`:

```jsx
import { MapView } from './components/MapView';
```

Replace the inner content div in App.jsx:

```jsx
<div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
  {featureMap ? (
    <MapView
      geojsonPowiaty={geojsonPowiaty}
      geojsonVoiv={geojsonVoiv}
      featureMap={featureMap}
    />
  ) : (
    <p style={{ padding: 20 }}>Loading map data...</p>
  )}
</div>
```

- [ ] **Step 3: Verify map renders**

```bash
npm run dev
```

Expected: Colored map of Poland's counties. Three distinct colors for Północ/Centrum/Południe regions. Voivodeship names as labels. Capital city dots and names. Hovering a county shows tooltip with county, voivodeship, region, handlowiec, baza.

- [ ] **Step 4: Check console for unmatched counties**

Open browser DevTools → Console. Note any lines: `Unmatched county: woj/pow`. Record them — they will be fixed in Task 10.

- [ ] **Step 5: Commit**

```bash
git add src/components/MapView.jsx src/App.jsx
git commit -m "feat: add interactive D3 web map with hover tooltips"
```

---

## Task 8: ExportView — Print-Ready Map

**Files:**
- Create: `src/components/ExportView.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Write ExportView component**

Create `src/components/ExportView.jsx`:

```jsx
import { useEffect } from 'react';
import * as d3 from 'd3';

const REGION_COLORS = {
  'Północ': '#4a90d9',
  'Centrum': '#6ab04c',
  'Południe': '#f0a500',
};

const BASE_W = 1800;
const BASE_H = 1200;
const MAP_W = 1300;
const LEGEND_X = 1340;

const LEGEND_ITEMS = [
  { region: 'Północ', handlowiec: 'Handlowiec 1', baza: 'Rumia' },
  { region: 'Centrum', handlowiec: 'Handlowiec 2', baza: 'Łódź' },
  { region: 'Południe', handlowiec: 'Handlowiec 3', baza: 'Rybnik' },
];

export function ExportView({ geojsonPowiaty, geojsonVoiv, featureMap, scale = 1, svgRef }) {
  useEffect(() => {
    if (!geojsonPowiaty || !geojsonVoiv || !featureMap || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const mapHeight = BASE_H - 120;
    const projection = d3.geoMercator().fitSize([MAP_W, mapHeight], geojsonPowiaty);
    const path = d3.geoPath().projection(projection);

    // Title
    svg.append('text')
      .attr('x', MAP_W / 2).attr('y', 38)
      .attr('text-anchor', 'middle')
      .attr('font-size', 22).attr('font-weight', 'bold')
      .attr('font-family', 'Arial, sans-serif').attr('fill', '#111')
      .text('PODZIAŁ POLSKI NA OBSZARY DZIAŁANIA HANDLOWCÓW');

    svg.append('text')
      .attr('x', MAP_W / 2).attr('y', 60)
      .attr('text-anchor', 'middle')
      .attr('font-size', 13).attr('font-family', 'Arial, sans-serif').attr('fill', '#555')
      .text('PODZIAŁ LOGISTYCZNY');

    // Map group (offset below title)
    const mapG = svg.append('g').attr('transform', 'translate(0, 80)');

    // County polygons
    mapG.append('g')
      .selectAll('path')
      .data(geojsonPowiaty.features)
      .join('path')
      .attr('d', path)
      .attr('fill', d => {
        const entry = featureMap.get(d);
        return entry ? REGION_COLORS[entry.region] : '#ccc';
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 0.3);

    // County name labels (all counties, small font)
    mapG.append('g')
      .selectAll('text')
      .data(geojsonPowiaty.features)
      .join('text')
      .attr('x', d => path.centroid(d)[0])
      .attr('y', d => path.centroid(d)[1])
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', 5.5)
      .attr('font-family', 'Arial, sans-serif')
      .attr('fill', '#000')
      .attr('pointer-events', 'none')
      .text(d => d.properties.NAME_2);

    // Voivodeship border overlay (thicker)
    mapG.append('g')
      .selectAll('path')
      .data(geojsonVoiv.features)
      .join('path')
      .attr('d', path)
      .attr('fill', 'none')
      .attr('stroke', '#222')
      .attr('stroke-width', 1.2);

    // Border legend note
    svg.append('text')
      .attr('x', 10).attr('y', BASE_H - 8)
      .attr('font-size', 9).attr('font-family', 'Arial, sans-serif').attr('fill', '#666')
      .text('Granice powiatów');

    // Legend panel
    const leg = svg.append('g').attr('transform', `translate(${LEGEND_X}, 60)`);

    leg.append('text')
      .attr('x', 0).attr('y', 0)
      .attr('font-size', 14).attr('font-weight', 'bold')
      .attr('font-family', 'Arial, sans-serif').attr('fill', '#111')
      .text('PODZIAŁ LOGISTYCZNY');

    LEGEND_ITEMS.forEach((item, i) => {
      const y = 50 + i * 90;

      leg.append('circle')
        .attr('cx', 14).attr('cy', y).attr('r', 12)
        .attr('fill', REGION_COLORS[item.region])
        .attr('stroke', '#333').attr('stroke-width', 1);

      leg.append('text')
        .attr('x', 34).attr('y', y - 10)
        .attr('font-size', 13).attr('font-weight', 'bold')
        .attr('font-family', 'Arial, sans-serif')
        .attr('fill', REGION_COLORS[item.region])
        .text(`REGION ${item.region.toUpperCase()}`);

      leg.append('text')
        .attr('x', 34).attr('y', y + 6)
        .attr('font-size', 11).attr('font-family', 'Arial, sans-serif').attr('fill', '#333')
        .text(`Baza: ${item.baza}`);

      leg.append('text')
        .attr('x', 34).attr('y', y + 20)
        .attr('font-size', 11).attr('font-family', 'Arial, sans-serif').attr('fill', '#555')
        .text(item.handlowiec);
    });

  }, [geojsonPowiaty, geojsonVoiv, featureMap]);

  return (
    <svg
      ref={svgRef}
      width={BASE_W * scale}
      height={BASE_H * scale}
      viewBox={`0 0 ${BASE_W} ${BASE_H}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ position: 'absolute', left: '-99999px', top: 0, pointerEvents: 'none' }}
    />
  );
}
```

- [ ] **Step 2: Mount ExportView in App.jsx**

Add import at top of `src/App.jsx`:

```jsx
import { ExportView } from './components/ExportView';
```

Add below the closing `</div>` of the main layout div (still inside the root div):

```jsx
{featureMap && (
  <ExportView
    geojsonPowiaty={geojsonPowiaty}
    geojsonVoiv={geojsonVoiv}
    featureMap={featureMap}
    scale={scale}
    svgRef={exportSvgRef}
  />
)}
```

- [ ] **Step 3: Temporarily reveal the export view to verify it**

In `ExportView.jsx`, temporarily change `left: '-99999px'` to `left: '0'` in the SVG style. Check:
- Counties colored correctly in three regions
- County name labels visible on each polygon
- Voivodeship borders visibly thicker than county borders
- Legend panel at right with color circles, region names, handlowiec, baza
- Title and subtitle at top

Then revert `left` back to `'-99999px'`.

- [ ] **Step 4: Commit**

```bash
git add src/components/ExportView.jsx src/App.jsx
git commit -m "feat: add print-ready export view with county labels and legend"
```

---

## Task 9: Export Functions + Wire Controls

**Files:**
- Create: `src/lib/exportMap.js`
- Modify: `src/App.jsx`

- [ ] **Step 1: Write export functions**

Create `src/lib/exportMap.js`:

```javascript
export function downloadSVG(svgElement, filename = 'map-regiony.svg') {
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svgElement);
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadPNG(svgElement, filename = 'map-regiony.png') {
  const width = parseInt(svgElement.getAttribute('width'));
  const height = parseInt(svgElement.getAttribute('height'));

  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svgElement);
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const img = new Image();
  img.src = url;
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0);
  URL.revokeObjectURL(url);

  return new Promise(resolve => {
    canvas.toBlob(pngBlob => {
      const pngUrl = URL.createObjectURL(pngBlob);
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(pngUrl);
      resolve();
    }, 'image/png');
  });
}
```

- [ ] **Step 2: Wire export handlers into App.jsx**

Add import at top of `src/App.jsx`:

```jsx
import { downloadSVG, downloadPNG } from './lib/exportMap';
```

Replace the stub `onExportSVG` and `onExportPNG` props on `<Controls>`:

```jsx
onExportSVG={() => {
  if (exportSvgRef.current) downloadSVG(exportSvgRef.current);
}}
onExportPNG={async () => {
  if (exportSvgRef.current) await downloadPNG(exportSvgRef.current);
}}
```

- [ ] **Step 3: Test SVG export**

```bash
npm run dev
```

Click "Download SVG" at 1x scale. Expected: browser downloads `map-regiony.svg`. Open in browser — full labeled map visible, vector format.

- [ ] **Step 4: Test PNG export at all scales**

Click "Download PNG" at 1x, 2x, 3x. Expected:
- 1x: `map-regiony.png`, 1800×1200px
- 2x: 3600×2400px
- 3x: 5400×3600px

Check file dimensions with image viewer or:
```bash
python3 -c "
from PIL import Image
img = Image.open('/Users/jakubbuczynski/Downloads/map-regiony.png')
print(img.size)
"
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/exportMap.js src/App.jsx
git commit -m "feat: add SVG and PNG export with configurable scale"
```

---

## Task 10: Integration — County Match Verification & Polish

**Files:**
- Modify: `src/lib/matchCounties.js` (add aliases for any unmatched counties)
- Modify: `index.html`

- [ ] **Step 1: Open dev server and inspect console**

```bash
npm run dev
```

Open browser DevTools → Console. Collect all lines matching: `Unmatched county: <woj>/<pow>`

- [ ] **Step 2: Fix unmatched counties with aliases**

For each unmatched county, find the correct Excel key by looking it up in `src/data/crm-data.json`, then add an entry to the `ALIASES` map in `src/lib/matchCounties.js`:

```javascript
const ALIASES = {
  // Each entry: 'gadm-normalized-key': 'excel-normalized-key'
  // Example if GADM uses 'city of wrocław' but Excel uses 'wrocław':
  // 'dolnośląskie/city of wrocław': 'dolnośląskie/wrocław',
};
```

After adding each alias, reload the browser and verify the warning disappears.

- [ ] **Step 3: Re-run unit tests**

```bash
npm test
```

Expected: All tests PASS (aliases don't affect mock test data).

- [ ] **Step 4: Visual acceptance check**

Export a 1x PNG and compare against the reference image from the client:
- Three regions colored blue (Północ), green (Centrum), orange (Południe) ✓
- All county boundaries visible ✓
- County names labeled on each polygon ✓
- Legend with region name (colored), handlowiec, baza ✓
- Title "PODZIAŁ POLSKI NA OBSZARY DZIAŁANIA HANDLOWCÓW" ✓
- Subtitle "PODZIAŁ LOGISTYCZNY" ✓
- No unmatched (grey) counties ✓

- [ ] **Step 5: Update page title**

In `index.html`, find and replace the `<title>` tag:

```html
<title>Podział Polski — Mapa Handlowców</title>
```

- [ ] **Step 6: Final commit**

```bash
git add src/lib/matchCounties.js index.html
git commit -m "feat: complete representative map tool with verified county matching"
```
