import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import polylabel from 'polylabel';
import { splitCamelCase } from '../lib/matchCounties';

const REGION_COLORS = {
  'Północ': '#9DC3E6',
  'Centrum': '#A9D18E',
  'Południe': '#FFD050',
};

const REGION_HOVER_COLORS = {
  'Północ': '#6AADD5',
  'Centrum': '#78B854',
  'Południe': '#FFBA00',
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

const REGION_LEGEND = [
  { name: 'Północ',   color: '#9DC3E6' },
  { name: 'Centrum',  color: '#A9D18E' },
  { name: 'Południe', color: '#FFD050' },
];

export function MapView({ geojsonPowiaty, geojsonVoiv, featureMap }) {
  const svgRef = useRef(null);
  const zoomRef = useRef(null);
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

    // All map elements live inside g so zoom/pan transform applies uniformly.
    const g = svg.append('g');
    let currentK = 1;

    // County polygons with hover highlight
    const countyPaths = g.append('g')
      .selectAll('path')
      .data(geojsonPowiaty.features)
      .join('path')
      .attr('d', path)
      .attr('fill', d => {
        const entry = featureMap.get(d);
        return entry ? (REGION_COLORS[entry.region] ?? '#ccc') : '#ccc';
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 0.4)
      .style('cursor', 'pointer')
      .on('mouseover', function(event, d) {
        const entry = featureMap.get(d);
        d3.select(this)
          .attr('fill', entry ? (REGION_HOVER_COLORS[entry.region] ?? '#aaa') : '#aaa')
          .attr('stroke', '#444')
          .attr('stroke-width', 1.5 / currentK);
        setTooltip({
          x: event.clientX, y: event.clientY,
          county: splitCamelCase(d.properties.NAME_2.replace(/\(city\)/i, '').trim()),
          voiv: d.properties.NAME_1,
          region: entry?.region ?? '—',
          handlowiec: entry?.handlowiec ?? '—',
          baza: entry?.baza ?? '—',
        });
      })
      .on('mousemove', (event) => {
        setTooltip(prev => prev ? { ...prev, x: event.clientX, y: event.clientY } : null);
      })
      .on('mouseout', function(event, d) {
        const entry = featureMap.get(d);
        d3.select(this)
          .attr('fill', entry ? (REGION_COLORS[entry.region] ?? '#ccc') : '#ccc')
          .attr('stroke', '#fff')
          .attr('stroke-width', 0.4 / currentK);
        setTooltip(null);
      });

    // County labels — revealed when zoom scale exceeds threshold.
    // Uses polylabel (pole of inaccessibility) so labels for donut-shaped counties
    // surrounding cities fall inside their own polygon, not in the city's void.

    // Build set of base names that have a (City) GADM counterpart.
    const cityBaseNames = new Set();
    for (const f of geojsonPowiaty.features) {
      if (/\(city\)/i.test(f.properties.NAME_2)) {
        cityBaseNames.add(f.properties.NAME_2.replace(/\(city\)/i, '').trim().toLowerCase());
      }
    }

    // For rural powiats whose GADM name matches a city (e.g. "Częstochowa" → "Częstochowski"),
    // use the CRM powiat name instead.
    function countyLabelText(f) {
      const baseName = f.properties.NAME_2.replace(/\(city\)/i, '').trim().toLowerCase();
      const isCityType = f.properties.TYPE_2 === 'Miastonaprawachpowiatu';
      const hasParenCity = /\(city\)/i.test(f.properties.NAME_2);
      if (!hasParenCity && !isCityType && cityBaseNames.has(baseName)) {
        const entry = featureMap.get(f);
        if (entry?.powiat && entry.powiat !== baseName) {
          const name = entry.powiat.charAt(0).toUpperCase() + entry.powiat.slice(1);
          return splitCamelCase(name);
        }
      }
      return splitCamelCase(f.properties.NAME_2.replace(/\(city\)/i, '').trim());
    }

    // Returns the pole of inaccessibility in SVG space (guaranteed inside polygon).
    function getVisualCenter(feature) {
      const geom = feature.geometry;
      const projectRing = ring => ring.map(coord => projection(coord)).filter(pt => pt !== null);
      let rings = null;
      if (geom.type === 'Polygon') {
        rings = geom.coordinates.map(projectRing);
      } else if (geom.type === 'MultiPolygon') {
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

    const countyLabelsG = g.append('g').attr('display', 'none');
    const countyLabelTexts = countyLabelsG
      .selectAll('text')
      .data(geojsonPowiaty.features)
      .join('text')
      .attr('x', d => getVisualCenter(d)[0])
      .attr('y', d => getVisualCenter(d)[1])
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', 9)
      .attr('font-family', 'Arial, sans-serif')
      .attr('fill', '#111')
      .attr('pointer-events', 'none')
      .text(d => countyLabelText(d));

    // Voivodeship border overlay
    const voivPaths = g.append('g')
      .selectAll('path')
      .data(geojsonVoiv.features)
      .join('path')
      .attr('d', path)
      .attr('fill', 'none')
      .attr('stroke', '#333')
      .attr('stroke-width', 1.5)
      .attr('pointer-events', 'none');

    // Voivodeship name labels — nudge away from capital city dots AND their text labels.
    const capitalBoxes = CAPITALS.map(c => {
      const [x, y] = projection(c.coords);
      const labelHalfW = (c.name.length * 11 * 0.55) / 2;
      return { dotX: x, dotY: y, labelCX: x + 6 + labelHalfW, labelCY: y + 4, labelHalfW, labelHalfH: 7 };
    });

    function voivLabelPos(feature, name) {
      const [cx, cy] = path.centroid(feature);
      if (isNaN(cx)) return [cx, cy];
      const vHalfW = (name.length * 11 * 0.55) / 2;
      const vHalfH = 7;
      const offsets = [
        [0, 0],
        [0, -16], [0, 16], [-16, 0], [16, 0],
        [-16, -16], [16, -16], [-16, 16], [16, 16],
        [0, -30], [0, 30], [-30, 0], [30, 0],
        [-30, -20], [30, -20],
      ];
      for (const [dx, dy] of offsets) {
        const px = cx + dx, py = cy + dy;
        const conflict = capitalBoxes.some(cap => {
          if (Math.hypot(px - cap.dotX, py - cap.dotY) < 22) return true;
          return (
            Math.abs(px - cap.labelCX) < vHalfW + cap.labelHalfW + 4 &&
            Math.abs(py - cap.labelCY) < vHalfH + cap.labelHalfH + 4
          );
        });
        if (!conflict) return [px, py];
      }
      return [cx, cy];
    }

    const voivLabels = g.append('g')
      .selectAll('text')
      .data(geojsonVoiv.features)
      .join('text')
      .attr('x', d => voivLabelPos(d, d.properties.NAME_1)[0])
      .attr('y', d => voivLabelPos(d, d.properties.NAME_1)[1])
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', 11)
      .attr('font-weight', '600')
      .attr('fill', '#222')
      .attr('pointer-events', 'none')
      .text(d => d.properties.NAME_1);

    // Capital city dots
    const capitalDots = g.append('g')
      .selectAll('circle')
      .data(CAPITALS)
      .join('circle')
      .attr('cx', d => projection(d.coords)[0])
      .attr('cy', d => projection(d.coords)[1])
      .attr('r', 4)
      .attr('fill', '#111')
      .attr('pointer-events', 'none');

    // Capital city labels
    const capitalLabels = g.append('g')
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

    // Zoom/pan — keeps labels at constant screen size, thins strokes as we zoom in
    const zoom = d3.zoom()
      .scaleExtent([1, 12])
      .on('zoom', (event) => {
        const { transform } = event;
        currentK = transform.k;
        g.attr('transform', transform);
        countyPaths.attr('stroke-width', 0.4 / currentK);
        voivPaths.attr('stroke-width', 1.5 / currentK);
        voivLabels.attr('font-size', 11 / currentK);
        capitalDots.attr('r', 4 / currentK);
        capitalLabels
          .attr('font-size', 11 / currentK)
          .attr('x', d => projection(d.coords)[0] + 6 / currentK)
          .attr('y', d => projection(d.coords)[1] + 4 / currentK);
        countyLabelsG.attr('display', currentK > 2.5 ? null : 'none');
        countyLabelTexts.attr('font-size', 9 / currentK);
      });

    svg.call(zoom);

    zoomRef.current = {
      zoomIn:  () => svg.transition().duration(300).call(zoom.scaleBy, 1.5),
      zoomOut: () => svg.transition().duration(300).call(zoom.scaleBy, 1 / 1.5),
      reset:   () => svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity),
    };

  }, [geojsonPowiaty, geojsonVoiv, featureMap]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: 'var(--color-bg)' }}>
      <svg ref={svgRef} style={{ display: 'block' }} />

      {/* Region legend — bottom left */}
      <div style={{
        position: 'absolute', bottom: 20, left: 18,
        background: 'rgba(255,255,255,0.94)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--color-border)',
        borderRadius: 6,
        padding: '10px 14px',
        boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
        pointerEvents: 'none',
      }}>
        <div style={{
          fontFamily: 'var(--font-body)', fontSize: 9, fontWeight: 600,
          letterSpacing: '0.14em', color: '#9CA3AF',
          textTransform: 'uppercase', marginBottom: 8,
        }}>Regiony</div>
        {REGION_LEGEND.map(r => (
          <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, lastChild: { marginBottom: 0 } }}>
            <div style={{ width: 11, height: 11, borderRadius: 2, background: r.color, border: '1px solid rgba(0,0,0,0.1)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500, color: '#374151' }}>{r.name}</span>
          </div>
        ))}
      </div>

      {/* Zoom controls — bottom right */}
      <div style={{ position: 'absolute', bottom: 20, right: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <button className="zoom-btn" onClick={() => zoomRef.current?.zoomIn()} title="Przybliż">+</button>
        <button className="zoom-btn" onClick={() => zoomRef.current?.zoomOut()} title="Oddal">−</button>
        <button className="zoom-btn" onClick={() => zoomRef.current?.reset()} title="Resetuj widok" style={{ fontSize: 11, marginTop: 3 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
          </svg>
        </button>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x + 16, top: tooltip.y - 12,
          background: 'var(--color-header)',
          border: '1px solid #1C2B3A',
          borderRadius: 5,
          padding: '10px 14px',
          pointerEvents: 'none',
          zIndex: 1000,
          boxShadow: '0 8px 28px rgba(0,0,0,0.28)',
          minWidth: 160,
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, letterSpacing: '0.02em', color: '#F1F5F9', lineHeight: 1.1 }}>
            {tooltip.county}
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 400, color: '#3B5268', marginTop: 2, marginBottom: 10, letterSpacing: '0.04em' }}>
            {tooltip.voiv}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {[
              { label: 'Region', value: tooltip.region },
              { label: 'Handlowiec', value: tooltip.handlowiec },
              { label: 'Baza', value: tooltip.baza },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 14 }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 9.5, fontWeight: 600, letterSpacing: '0.1em', color: '#2D4259', textTransform: 'uppercase' }}>
                  {label}
                </span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 500, color: '#CBD5E1' }}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
