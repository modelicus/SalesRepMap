import { useState, useEffect, useCallback, useRef } from 'react';
import { Controls } from './components/Controls';
import { MapView } from './components/MapView';
import { ExportView } from './components/ExportView';
import { parseExcelData } from './lib/parseExcel';
import { buildFeatureMap } from './lib/matchCounties';
import { downloadSVG, downloadPNG } from './lib/exportMap';
import defaultCrmData from './data/crm-data.json';
import gadmCrmMap from './data/gadm-crm-map.json';

export default function App() {
  const [geojsonPowiaty, setGeojsonPowiaty] = useState(null);
  const [geojsonVoiv, setGeojsonVoiv] = useState(null);
  const [crmData, setCrmData] = useState(defaultCrmData);
  const [featureMap, setFeatureMap] = useState(null);
  const [scale, setScale] = useState(2);
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
      setFeatureMap(buildFeatureMap(geojsonPowiaty, gadmCrmMap, crmData.powiaty));
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
        onExportSVG={() => {
          if (exportSvgRef.current) downloadSVG(exportSvgRef.current);
        }}
        onExportPNG={async () => {
          if (exportSvgRef.current) await downloadPNG(exportSvgRef.current);
        }}
      />
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {featureMap ? (
          <MapView
            geojsonPowiaty={geojsonPowiaty}
            geojsonVoiv={geojsonVoiv}
            featureMap={featureMap}
          />
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100%', gap: 12, color: '#3B5268',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3B5268" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
              <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/>
            </svg>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3B5268' }}>
              Ładowanie danych…
            </span>
          </div>
        )}
      </div>
      {featureMap && (
        <ExportView
          geojsonPowiaty={geojsonPowiaty}
          geojsonVoiv={geojsonVoiv}
          featureMap={featureMap}
          scale={scale}
          svgRef={exportSvgRef}
        />
      )}
    </div>
  );
}
