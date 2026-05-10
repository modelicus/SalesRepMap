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
        return entry ? (REGION_COLORS[entry.region] ?? '#ccc') : '#ccc';
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
