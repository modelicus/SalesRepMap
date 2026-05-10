function serializeSvg(svgElement) {
  // Clone so we don't mutate the live element.
  // Remove the off-screen positioning style added for hiding the export canvas —
  // it gets embedded in the SVG string and can confuse SVG-as-image renderers.
  const clone = svgElement.cloneNode(true);
  clone.removeAttribute('style');
  return new XMLSerializer().serializeToString(clone);
}

export function downloadSVG(svgElement, filename = 'map-regiony.svg') {
  const svgStr = serializeSvg(svgElement);
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

  const svgStr = serializeSvg(svgElement);

  // Use a data URI instead of a blob URL — blob URLs for SVG are unreliable
  // for canvas drawImage across browsers (can produce a blank white result).
  const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`;

  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = dataUri;
  });

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

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
