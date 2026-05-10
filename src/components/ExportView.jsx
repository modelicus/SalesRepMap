import { useEffect } from 'react';
import * as d3 from 'd3';
import polylabel from 'polylabel';
import { splitCamelCase } from '../lib/matchCounties';

const REGION_COLORS = {
  'Północ': '#9DC3E6',
  'Centrum': '#A9D18E',
  'Południe': '#FFD050',
};
// Darker variants for text readability on white background
const REGION_TEXT_COLORS = {
  'Północ': '#2E74B5',
  'Centrum': '#538135',
  'Południe': '#C45911',
};
const REGION_ORDER = ['Północ', 'Centrum', 'Południe'];

const BASE_W = 1800;
const BASE_H = 1200;
const MAP_W = 1300;
const LEGEND_X = 1340;

// Voivodeship capitals — matched against GADM NAME_2 after stripping "(City)".
// CamelCase preserved as GADM stores it (e.g. "ZielonaGóra", "GorzówWielkopolski").
const MAJOR_CITIES = new Set([
  'Warszawa', 'Kraków', 'Gdańsk', 'Wrocław', 'Poznań', 'Łódź',
  'Szczecin', 'Bydgoszcz', 'Lublin', 'Białystok', 'Katowice',
  'Rzeszów', 'Olsztyn', 'ZielonaGóra', 'GorzówWielkopolski', 'Opole', 'Kielce',
]);

// Approximate character-width ratio for Arial (good enough for collision detection).
// Kept deliberately conservative so fewer labels are filtered out.
const CHAR_WIDTH_RATIO = 0.50;
const LABEL_PADDING = 1; // minimum gap (SVG units) between label edges

export function ExportView({ geojsonPowiaty, geojsonVoiv, featureMap, scale = 1, svgRef }) {
  useEffect(() => {
    if (!geojsonPowiaty || !geojsonVoiv || !featureMap || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const mapHeight = BASE_H - 145;
    const projection = d3.geoMercator().fitSize([MAP_W, mapHeight], geojsonPowiaty);
    const path = d3.geoPath().projection(projection);

    // Derive legend from featureMap (one entry per region, ordered)
    const seenRegions = new Set();
    const legendItems = [];
    for (const entry of featureMap.values()) {
      if (!entry || seenRegions.has(entry.region)) continue;
      seenRegions.add(entry.region);
      legendItems.push({ region: entry.region, handlowiec: entry.handlowiec, baza: entry.baza });
    }
    legendItems.sort((a, b) => REGION_ORDER.indexOf(a.region) - REGION_ORDER.indexOf(b.region));

    // Compute per-region voivodeship coverage for the detailed legend.
    // Uses entry.powiat (CRM key suffix) to deduplicate multiple GADM features per county.
    const voivByRegion = new Map(); // region → Map<voivName, Set<powiatName>>
    const voivAllPowiaty = new Map(); // voivName → Set<powiatName> across all regions
    for (const [feature, entry] of featureMap.entries()) {
      if (!entry?.powiat || !entry.region) continue;
      const voivName = feature.properties.NAME_1;
      const { region, powiat } = entry;
      if (!voivByRegion.has(region)) voivByRegion.set(region, new Map());
      const regMap = voivByRegion.get(region);
      if (!regMap.has(voivName)) regMap.set(voivName, new Set());
      regMap.get(voivName).add(powiat);
      if (!voivAllPowiaty.has(voivName)) voivAllPowiaty.set(voivName, new Set());
      voivAllPowiaty.get(voivName).add(powiat);
    }
    const voivDetailByRegion = {}; // region → [{voiv, type, powiaty?}]
    for (const [region, regMap] of voivByRegion.entries()) {
      const lines = [];
      for (const [voivName, powiatSet] of regMap.entries()) {
        const total = voivAllPowiaty.get(voivName)?.size ?? 0;
        if (powiatSet.size === total) {
          lines.push({ voiv: voivName, type: 'all' });
        } else {
          const powiaty = [...powiatSet]
            .sort()
            .map(p => p.charAt(0).toUpperCase() + p.slice(1));
          lines.push({ voiv: voivName, type: 'partial', powiaty });
        }
      }
      lines.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'all' ? -1 : 1;
        return a.voiv.localeCompare(b.voiv, 'pl');
      });
      voivDetailByRegion[region] = lines;
    }

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
    const mapG = svg.append('g').attr('transform', 'translate(0, 105)');

    // County polygons
    mapG.append('g')
      .selectAll('path')
      .data(geojsonPowiaty.features)
      .join('path')
      .attr('d', path)
      .attr('fill', d => {
        const entry = featureMap.get(d);
        return entry ? (REGION_COLORS[entry.region] ?? '#ccc') : '#ccc';
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 0.3);

    // Skip rural features that have a (City) GADM counterpart at the same location.
    const cityBaseNames = new Set();
    for (const f of geojsonPowiaty.features) {
      if (/\(city\)/i.test(f.properties.NAME_2)) {
        cityBaseNames.add(f.properties.NAME_2.replace(/\(city\)/i, '').trim().toLowerCase());
      }
    }
    // Keep rural powiats whose CRM name differs from their GADM base name —
    // these are surrounding counties (e.g. "Częstochowa" GADM → "Częstochowski" CRM).
    // Only drop rural features that are true city duplicates (same CRM name as GADM base).
    const dedupedFeatures = geojsonPowiaty.features.filter(f => {
      const hasParenCity = /\(city\)/i.test(f.properties.NAME_2);
      const baseName = f.properties.NAME_2.replace(/\(city\)/i, '').trim().toLowerCase();
      const isCityType = f.properties.TYPE_2 === 'Miastonaprawachpowiatu';
      if (!hasParenCity && !isCityType && cityBaseNames.has(baseName)) {
        const entry = featureMap.get(f);
        // Keep if CRM powiat name differs from GADM base name (surrounding rural powiat)
        return !!(entry?.powiat && entry.powiat !== baseName);
      }
      return true;
    });

    // Returns the pole of inaccessibility (guaranteed inside the polygon) in SVG space.
    // Falls back to path.centroid if the geometry can't be projected.
    function getVisualCenter(feature) {
      const geom = feature.geometry;
      const projectRing = ring =>
        ring.map(coord => projection(coord)).filter(pt => pt !== null);

      let rings = null;
      if (geom.type === 'Polygon') {
        rings = geom.coordinates.map(projectRing);
      } else if (geom.type === 'MultiPolygon') {
        // Use the polygon with the most exterior-ring vertices (largest by proxy)
        let best = null, bestLen = 0;
        for (const poly of geom.coordinates) {
          if (poly[0].length > bestLen) { bestLen = poly[0].length; best = poly; }
        }
        if (best) rings = best.map(projectRing);
      }

      if (!rings || rings[0].length < 3) return path.centroid(feature);
      const pt = polylabel(rings, 0.5);
      return isNaN(pt[0]) ? path.centroid(feature) : pt;
    }

    // Annotate each candidate with its SVG centroid, label text, and estimated bbox.
    // Kept rural powiats sharing a GADM name with their city use the CRM powiat name.
    const labelText = f => {
      const hasParenCity = /\(city\)/i.test(f.properties.NAME_2);
      const baseName = f.properties.NAME_2.replace(/\(city\)/i, '').trim().toLowerCase();
      const isCityType = f.properties.TYPE_2 === 'Miastonaprawachpowiatu';
      if (!hasParenCity && !isCityType && cityBaseNames.has(baseName)) {
        const entry = featureMap.get(f);
        if (entry?.powiat && entry.powiat !== baseName) {
          const name = entry.powiat.charAt(0).toUpperCase() + entry.powiat.slice(1);
          return splitCamelCase(name);
        }
      }
      return splitCamelCase(f.properties.NAME_2.replace(/\(city\)/i, '').trim());
    };
    const candidates = dedupedFeatures
      .map(f => {
        const text = labelText(f);
        const isMajor = MAJOR_CITIES.has(text);
        const fs = isMajor ? 7 : 4.5;
        const [cx, cy] = getVisualCenter(f);
        return {
          text, cx, cy, isMajor, fs,
          halfW: (text.length * fs * CHAR_WIDTH_RATIO) / 2,
          halfH: fs * 0.5,
        };
      })
      .filter(d => !isNaN(d.cx) && !isNaN(d.cy));

    // Returns true if (cx, cy) with given half-extents overlaps any placed label.
    function collides(cx, cy, halfW, halfH, placedList) {
      for (const p of placedList) {
        if (
          Math.abs(cx - p.px) < halfW + p.halfW + LABEL_PADDING &&
          Math.abs(cy - p.py) < halfH + p.halfH + LABEL_PADDING
        ) return true;
      }
      return false;
    }

    // Greedy placement: major cities first (always placed at centroid).
    // Non-major labels try 2D nudges (vertical then horizontal) before being dropped.
    // Order: [0,0], [0,-d], [0,+d], [-d,0], [+d,0] for d = STEP … MAX_SHIFT.
    const STEP = 5;       // SVG units per nudge attempt
    const MAX_SHIFT = 30; // maximum displacement in any direction

    candidates.sort((a, b) => (a.isMajor ? 0 : 1) - (b.isMajor ? 0 : 1));

    const placed = [];   // { px, py, halfW, halfH }
    const visibleLabels = [];

    for (const item of candidates) {
      if (item.isMajor) {
        placed.push({ px: item.cx, py: item.cy, halfW: item.halfW, halfH: item.halfH });
        visibleLabels.push({ ...item, px: item.cx, py: item.cy });
        continue;
      }

      // Build 2D offset list: centre first, then cardinal directions at each step.
      const offsets2D = [[0, 0]];
      for (let d = STEP; d <= MAX_SHIFT; d += STEP) {
        offsets2D.push([0, -d], [0, d], [-d, 0], [d, 0]);
      }

      let placed_px = null, placed_py = null;
      for (const [dx, dy] of offsets2D) {
        const px = item.cx + dx;
        const py = item.cy + dy;
        if (!collides(px, py, item.halfW, item.halfH, placed)) {
          placed_px = px;
          placed_py = py;
          break;
        }
      }

      if (placed_px !== null) {
        placed.push({ px: placed_px, py: placed_py, halfW: item.halfW, halfH: item.halfH });
        visibleLabels.push({ ...item, px: placed_px, py: placed_py });
      }
    }

    mapG.append('g')
      .selectAll('text')
      .data(visibleLabels)
      .join('text')
      .attr('x', d => d.px)
      .attr('y', d => d.py)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', d => MAJOR_CITIES.has(d.text) ? 7 : 4.5)
      .attr('font-weight', d => MAJOR_CITIES.has(d.text) ? 'bold' : 'normal')
      .attr('font-family', 'Arial, sans-serif')
      .attr('fill', '#000')
      .attr('pointer-events', 'none')
      .text(d => d.text);

    // Voivodeship border overlay (thicker)
    mapG.append('g')
      .selectAll('path')
      .data(geojsonVoiv.features)
      .join('path')
      .attr('d', path)
      .attr('fill', 'none')
      .attr('stroke', '#222')
      .attr('stroke-width', 1.2);

    // Footer note
    svg.append('text')
      .attr('x', 10).attr('y', BASE_H - 8)
      .attr('font-size', 9).attr('font-family', 'Arial, sans-serif').attr('fill', '#666')
      .text('Granice powiatów');

    // Legend panel
    const LEGEND_W = BASE_W - LEGEND_X - 16;
    const LEG_FONT = 13;   // voivodeship bullet font size
    const LEG_LINE_H = 17; // line height for bullet lines
    const MAX_CHARS = Math.floor(LEGEND_W / (LEG_FONT * 0.52));

    function wordWrap(text, maxChars) {
      const words = text.split(' ');
      const lines = [];
      let cur = '';
      for (const w of words) {
        const t = cur ? `${cur} ${w}` : w;
        if (t.length > maxChars && cur) { lines.push(cur); cur = w; }
        else { cur = t; }
      }
      if (cur) lines.push(cur);
      return lines;
    }

    const leg = svg.append('g').attr('transform', `translate(${LEGEND_X}, 50)`);

    leg.append('text')
      .attr('x', 0).attr('y', 0)
      .attr('font-size', 18).attr('font-weight', 'bold')
      .attr('font-family', 'Arial, sans-serif').attr('fill', '#111')
      .text('PODZIAŁ LOGISTYCZNY');

    let legY = 38;
    for (const item of legendItems) {
      const fillColor = REGION_COLORS[item.region] ?? '#ccc';
      const textColor = REGION_TEXT_COLORS[item.region] ?? '#333';

      leg.append('circle')
        .attr('cx', 12).attr('cy', legY + 6).attr('r', 10)
        .attr('fill', fillColor).attr('stroke', '#444').attr('stroke-width', 0.8);

      leg.append('text')
        .attr('x', 30).attr('y', legY + 13)
        .attr('font-size', 17).attr('font-weight', 'bold')
        .attr('font-family', 'Arial, sans-serif').attr('fill', textColor)
        .text(`REGION ${item.region.toUpperCase()}`);

      legY += 40;

      leg.append('text')
        .attr('x', 4).attr('y', legY)
        .attr('font-size', 14).attr('font-family', 'Arial, sans-serif').attr('fill', '#333')
        .text(`Baza: ${item.baza}`);

      legY += 19;

      leg.append('text')
        .attr('x', 4).attr('y', legY)
        .attr('font-size', 14).attr('font-family', 'Arial, sans-serif').attr('fill', '#555')
        .text(item.handlowiec);

      legY += 21;

      for (const { voiv, type, powiaty } of (voivDetailByRegion[item.region] ?? [])) {
        const raw = type === 'all'
          ? `${voiv} – całe`
          : `${voiv} – powiaty: ${powiaty.join(', ')}`;
        const wrapped = wordWrap(raw, MAX_CHARS);
        for (let i = 0; i < wrapped.length; i++) {
          leg.append('text')
            .attr('x', 4).attr('y', legY)
            .attr('font-size', LEG_FONT).attr('font-family', 'Arial, sans-serif').attr('fill', '#333')
            .text((i === 0 ? '• ' : '   ') + wrapped[i]);
          legY += LEG_LINE_H;
        }
      }

      legY += 26; // gap between regions
    }

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
