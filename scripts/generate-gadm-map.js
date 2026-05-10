/**
 * Generates src/data/gadm-crm-map.json:
 * a static map from normalized GADM key → Excel CRM key.
 *
 * Run once (or when GeoJSON/Excel data changes):
 *   node scripts/generate-gadm-map.js
 *
 * Strategy:
 * 1. Exact match after camelCase split + (City) removal
 * 2. Confidence-sorted Levenshtein within each voivodeship
 *    (most-certain matches first avoids greedy ordering mistakes)
 * 3. Known special cases: ZalewSzczeciński → null (GADM water body artifact)
 */
import { readFileSync, writeFileSync } from 'fs';

const gj = JSON.parse(readFileSync('public/poland-powiaty.geojson', 'utf8'));
const crm = JSON.parse(readFileSync('src/data/crm-data.json', 'utf8'));

// ── helpers ────────────────────────────────────────────────────────────────

function splitCamelCase(s) {
  return s.replace(/([a-ząćęłńóśźż])([A-ZĄĆĘŁŃÓŚŹŻ])/g, '$1 $2');
}

function norm(s) {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// GADM artifacts that have no corresponding powiat in the Excel data.
// These map to null (will show as uncolored on the map).
const GADM_NULLS = new Set(['zachodniopomorskie/zalew szczeciński']);

// ── build GADM entry list ───────────────────────────────────────────────────

const gadmEntries = gj.features.map(f => {
  const woj = norm(f.properties.NAME_1);
  const isCity = /\(city\)/i.test(f.properties.NAME_2);
  let name = f.properties.NAME_2.replace(/\(city\)/i, '');
  name = splitCamelCase(name);
  const pow = norm(name);
  return { woj, pow, isCity, gadmKey: `${woj}/${pow}`, original: f.properties.NAME_2 };
});

// ── pass 1: exact matches ───────────────────────────────────────────────────
// Sort (City) entries first so they claim the city Excel key before the
// identically-named rural entry can steal it (e.g. Krosno vs Krosno(City)).

const crmKeys = new Set(Object.keys(crm.powiaty));
const mapping = {};
const usedCrmKeys = new Set();
const unmatchedGadm = [];

const pass1Entries = [...gadmEntries].sort((a, b) => {
  if (a.isCity !== b.isCity) return a.isCity ? -1 : 1;
  return 0;
});

for (const entry of pass1Entries) {
  if (GADM_NULLS.has(entry.gadmKey)) {
    mapping[entry.gadmKey] = null;
    continue;
  }
  if (crmKeys.has(entry.gadmKey) && !usedCrmKeys.has(entry.gadmKey)) {
    mapping[entry.gadmKey] = entry.gadmKey;
    usedCrmKeys.add(entry.gadmKey);
  } else if (crmKeys.has(entry.gadmKey) && usedCrmKeys.has(entry.gadmKey)) {
    // Duplicate key collision (e.g. Kalisz + Kalisz(City) both → "kalisz")
    // The non-city one needs fuzzy matching
    unmatchedGadm.push(entry);
  } else {
    unmatchedGadm.push(entry);
  }
}

console.log(`Exact matches: ${Object.keys(mapping).length - Object.values(mapping).filter(v => v === null).length}`);
console.log(`Nulls: ${Object.values(mapping).filter(v => v === null).length}`);
console.log(`Unmatched GADM: ${unmatchedGadm.length}`);

// ── pass 2: confidence-sorted Levenshtein per voivodeship ──────────────────

const unmatchedCrm = [...crmKeys].filter(k => !usedCrmKeys.has(k));

// Group by voivodeship
const gadmByVoiv = {};
for (const entry of unmatchedGadm) {
  (gadmByVoiv[entry.woj] ??= []).push(entry);
}
const crmByVoiv = {};
for (const key of unmatchedCrm) {
  const slash = key.indexOf('/');
  const woj = key.slice(0, slash);
  (crmByVoiv[woj] ??= []).push(key);
}

let fuzzyMatched = 0;
let fuzzyFailed = 0;

for (const [woj, gadmList] of Object.entries(gadmByVoiv)) {
  const crmList = [...(crmByVoiv[woj] ?? [])];

  // Sort: (City) entries first so they grab city-name CRM keys before rural entries do.
  // Within each group, sort by best available Levenshtein distance ascending
  // (most-certain matches processed first = greedy ordering by confidence).
  const scored = gadmList.map(entry => {
    let bestDist = Infinity;
    for (const crmKey of crmList) {
      const crmPow = crmKey.slice(crmKey.indexOf('/') + 1);
      const d = levenshtein(entry.pow, crmPow);
      if (d < bestDist) bestDist = d;
    }
    return { entry, bestDist };
  });

  scored.sort((a, b) => {
    // City entries first
    if (a.entry.isCity !== b.entry.isCity) return a.entry.isCity ? -1 : 1;
    // Then by confidence (lower distance = more certain = first)
    return a.bestDist - b.bestDist;
  });

  for (const { entry } of scored) {
    if (crmList.length === 0) {
      console.warn(`  NO CRM KEYS LEFT for ${woj} when matching ${entry.gadmKey}`);
      mapping[entry.gadmKey] = null;
      fuzzyFailed++;
      continue;
    }

    let bestKey = null;
    let bestDist = Infinity;
    for (const crmKey of crmList) {
      const crmPow = crmKey.slice(crmKey.indexOf('/') + 1);
      const d = levenshtein(entry.pow, crmPow);
      if (d < bestDist) {
        bestDist = d;
        bestKey = crmKey;
      }
    }

    mapping[entry.gadmKey] = bestKey;
    crmList.splice(crmList.indexOf(bestKey), 1);
    fuzzyMatched++;
  }
}

console.log(`Fuzzy matched: ${fuzzyMatched}`);
console.log(`Failed: ${fuzzyFailed}`);
console.log(`Total entries: ${Object.keys(mapping).length}`);

// ── manual corrections for fuzzy-match failures ────────────────────────────
// Key: GADM key that was wrong; Value: correct CRM key it should map to.
// The displaced CRM key is automatically re-assigned to the entry that
// incorrectly received the correct key.
const MANUAL_CORRECTIONS = {
  'wielkopolskie/środa wielkopolska': 'wielkopolskie/średzki',
};

for (const [gadmKey, correctCrmKey] of Object.entries(MANUAL_CORRECTIONS)) {
  const wrongCrmKey = mapping[gadmKey];
  if (wrongCrmKey === correctCrmKey) continue; // already correct
  // Find the GADM entry that was wrongly assigned the correct CRM key
  const displaced = Object.entries(mapping).find(
    ([k, v]) => v === correctCrmKey && k !== gadmKey
  );
  mapping[gadmKey] = correctCrmKey;
  if (displaced) {
    mapping[displaced[0]] = wrongCrmKey;
    console.log(`  Correction: ${gadmKey} → ${correctCrmKey}`);
    console.log(`  Swap:       ${displaced[0]} → ${wrongCrmKey}`);
  }
}

// ── spot-check suspicious matches (distance > 7) after corrections ──────────

const suspicious = [];
for (const [gadmKey, crmKey] of Object.entries(mapping)) {
  if (!crmKey || gadmKey === crmKey) continue;
  const gadmPow = gadmKey.slice(gadmKey.indexOf('/') + 1);
  const crmPow = crmKey.slice(crmKey.indexOf('/') + 1);
  const dist = levenshtein(gadmPow, crmPow);
  if (dist > 7) suspicious.push({ gadmKey, crmKey, dist });
}

if (suspicious.length > 0) {
  console.log('\nSuspicious matches (distance > 7) — review manually:');
  for (const s of suspicious.sort((a, b) => b.dist - a.dist)) {
    console.log(`  [${s.dist}] ${s.gadmKey} → ${s.crmKey}`);
  }
} else {
  console.log('\nAll fuzzy matches look reasonable (distance ≤ 7).');
}

writeFileSync('src/data/gadm-crm-map.json', JSON.stringify(mapping, null, 2));
console.log('\nWrote src/data/gadm-crm-map.json');
