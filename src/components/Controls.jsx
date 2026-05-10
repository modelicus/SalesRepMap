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
