const DownloadIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
  </svg>
);

const UploadIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
  </svg>
);

const Divider = () => (
  <div style={{ width: 1, height: 26, background: '#2D4155', flexShrink: 0 }} />
);

export function Controls({ scale, onScaleChange, onFileUpload, onExportSVG, onExportPNG }) {
  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onFileUpload(ev.target.result);
    reader.readAsArrayBuffer(file);
  }

  return (
    <header style={{
      display: 'flex', alignItems: 'center',
      height: 50,
      background: 'var(--color-header)',
      borderBottom: '1px solid #2D4155',
      flexShrink: 0,
      userSelect: 'none',
    }}>
      <div style={{ flex: 1 }} />

      {/* Upload */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 14px', height: '100%', borderLeft: '1px solid #2D4155' }}>
        <label className="ctrl-upload">
          <UploadIcon />
          Wgraj XLSX
          <input type="file" accept=".xlsx" onChange={handleFile} style={{ display: 'none' }} />
        </label>
      </div>

      <Divider />

      {/* Scale */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '0 14px', height: '100%' }}>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', color: '#7A9BB5', textTransform: 'uppercase', marginRight: 5 }}>
          Skala
        </span>
        {[1, 2, 3, 4].map(s => (
          <button
            key={s}
            onClick={() => onScaleChange(s)}
            style={{
              width: 34, height: 28, border: 'none', borderRadius: 3, cursor: 'pointer',
              fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '0.04em',
              background: scale === s ? 'var(--color-accent)' : 'transparent',
              color: scale === s ? '#FFFFFF' : '#8AAEC8',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (scale !== s) { e.currentTarget.style.color = '#C8DFEE'; e.currentTarget.style.background = '#1C2B3A'; } }}
            onMouseLeave={e => { if (scale !== s) { e.currentTarget.style.color = '#8AAEC8'; e.currentTarget.style.background = 'transparent'; } }}
          >
            {s}×
          </button>
        ))}
      </div>

      <Divider />

      {/* Export */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px', height: '100%' }}>
        <button className="ctrl-btn" onClick={onExportSVG}><DownloadIcon /> SVG</button>
        <button className="ctrl-btn" onClick={onExportPNG}><DownloadIcon /> PNG</button>
      </div>
    </header>
  );
}
