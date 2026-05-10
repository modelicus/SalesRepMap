import { useState, useEffect, useCallback, useRef } from 'react';
import { Controls } from './components/Controls';
import { MapView } from './components/MapView';
import { ExportView } from './components/ExportView';
import { parseExcelData } from './lib/parseExcel';
import { buildFeatureMap } from './lib/matchCounties';
import defaultCrmData from './data/crm-data.json';
import gadmCrmMap from './data/gadm-crm-map.json';

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
        onExportSVG={() => {/* wired in Task 9 */}}
        onExportPNG={() => {/* wired in Task 9 */}}
      />
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
