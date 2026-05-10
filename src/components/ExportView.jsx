import { useEffect } from 'react';
import * as d3 from 'd3';

const REGION_COLORS = {
  'Północ': '#4a90d9',
  'Centrum': '#6ab04c',
  'Południe': '#f0a500',
};
const REGION_ORDER = ['Północ', 'Centrum', 'Południe'];

const BASE_W = 1800;
const BASE_H = 1200;
const MAP_W = 1300;
const LEGEND_X = 1340;

export function ExportView({ geojsonPowiaty, geojsonVoiv, featureMap, scale = 1, svgRef }) {
  useEffect(() => {
    if (!geojsonPowiaty || !geojsonVoiv || !featureMap || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const mapHeight = BASE_H - 120;
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
        return entry ? (REGION_COLORS[entry.region] ?? '#ccc') : '#ccc';
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

    // Footer note
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

    legendItems.forEach((item, i) => {
      const y = 50 + i * 90;

      leg.append('circle')
        .attr('cx', 14).attr('cy', y).attr('r', 12)
        .attr('fill', REGION_COLORS[item.region] ?? '#ccc')
        .attr('stroke', '#333').attr('stroke-width', 1);

      leg.append('text')
        .attr('x', 34).attr('y', y - 10)
        .attr('font-size', 13).attr('font-weight', 'bold')
        .attr('font-family', 'Arial, sans-serif')
        .attr('fill', REGION_COLORS[item.region] ?? '#333')
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
