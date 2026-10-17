/// <reference types="vite/client" />
// Web build: turn the quote HTML into a real PDF file and download it — no print dialog, works in any browser.
// (The Electron build keeps webContents.printToPDF.) Renders the quote in an off-screen frame at Letter-landscape
// content width, rasterizes it at 2× with html2canvas, and slices it into pages at safe break points (top of a
// unit card or table row) so a unit's drawing never splits across pages. The libraries load only on export.

const DPI = 96;                                   // CSS px per inch
const PAGE_W_IN = 11, PAGE_H_IN = 8.5;            // Letter landscape — matches the quote's @page
const MARGIN_X_IN = 0.6, MARGIN_Y_IN = 0.5;
const CONTENT_W_PX = Math.round((PAGE_W_IN - 2 * MARGIN_X_IN) * DPI);
const CONTENT_H_PX = Math.round((PAGE_H_IN - 2 * MARGIN_Y_IN) * DPI);
const SCALE = 3;                                  // ≈ 288 dpi on paper

// Downscale an image in halving steps to exactly the size it will occupy in the PDF and return it as a data URL.
// A single big drawImage (1024px logo → ~200px) skips pixels and looks jagged; halving steps average them.
// Returning a data URL also matters: foreignObject rendering can't load external image URLs.
async function crispDataUrl(img: HTMLImageElement, cssW: number, cssH: number): Promise<string> {
  const tw = Math.max(1, Math.round(cssW * SCALE)), th = Math.max(1, Math.round(cssH * SCALE));
  let src: CanvasImageSource = img, w = img.naturalWidth, h = img.naturalHeight;
  while (w / 2 >= tw && h / 2 >= th) {
    const c = document.createElement('canvas'); c.width = Math.round(w / 2); c.height = Math.round(h / 2);
    const g = c.getContext('2d')!; g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, c.width, c.height);
    src = c; w = c.width; h = c.height;
  }
  const out = document.createElement('canvas'); out.width = tw; out.height = th;
  const g = out.getContext('2d')!; g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, tw, th);
  return out.toDataURL('image/png');
}

export async function exportQuotePdf(html: string, fileName: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);

  const frame = document.createElement('iframe');
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${CONTENT_W_PX}px;height:${CONTENT_H_PX}px;border:0;visibility:hidden`;
  frame.srcdoc = html;
  document.body.appendChild(frame);
  try {
    await new Promise<void>((resolve) => { frame.onload = () => resolve(); });
    const doc = frame.contentDocument!;
    // The quote's @page margins don't apply on screen; the PDF margins below take their place.
    doc.body.style.margin = '0';
    await Promise.all([...doc.images].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })));
    // Replace each image with a crisp, pre-sized data URL (see crispDataUrl).
    for (const img of [...doc.images]) {
      if (!img.naturalWidth) continue;
      const r = img.getBoundingClientRect();
      img.src = await crispDataUrl(img, r.width, r.height);
      await img.decode().catch(() => {});
    }

    const totalH = doc.body.scrollHeight;
    const top = (el: Element) => Math.round(el.getBoundingClientRect().top + (frame.contentWindow?.scrollY || 0));
    // Unit cards (page-break-inside:avoid) must never be split; a break is only allowed outside every card.
    const keepTogether = [...doc.querySelectorAll<HTMLElement>('[style*="page-break-inside:avoid"]')]
      .map(el => ({ a: top(el), b: top(el) + el.offsetHeight }));
    const insideCard = (y: number) => keepTogether.some(r => y > r.a + 1 && y < r.b - 1);
    // Safe places to start a new page: card tops and table-row tops that aren't inside a card.
    const breaks = new Set<number>([totalH]);
    doc.querySelectorAll<HTMLElement>('[style*="page-break-inside:avoid"], tr').forEach(el => {
      const y = top(el);
      if (!insideCard(y)) breaks.add(y);
    });
    const sorted = [...breaks].sort((a, b) => a - b);

    // foreignObjectRendering: the browser itself paints the HTML (via SVG foreignObject), so text position, kerning
    // and table borders match the screen exactly. html2canvas's own text renderer drew text a few px low, which
    // pushed the last row of each table into the table's bottom border.
    const canvas = await html2canvas(doc.body, {
      scale: SCALE, backgroundColor: '#ffffff', useCORS: true, foreignObjectRendering: true,
      width: CONTENT_W_PX, windowWidth: CONTENT_W_PX, height: totalH, windowHeight: totalH,
    });

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'in', format: 'letter' });
    let start = 0, first = true;
    while (start < totalH - 1) {
      // Furthest safe break that still fits on this page; if none, cut at the page height.
      const limit = start + CONTENT_H_PX;
      const fit = sorted.filter(y => y > start + 1 && y <= limit);
      const end = fit.length ? fit[fit.length - 1] : Math.min(limit, totalH);
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = Math.round((end - start) * SCALE);
      slice.getContext('2d')!.drawImage(canvas, 0, Math.round(start * SCALE), canvas.width, slice.height, 0, 0, canvas.width, slice.height);
      if (!first) pdf.addPage();
      // PNG, not JPEG: JPEG blurs the edges of small text. jsPDF's FAST compression keeps files reasonable.
      const pageUrl = slice.toDataURL('image/png');
      if (import.meta.env.DEV) ((window as unknown as { __quotePdfPages?: string[] }).__quotePdfPages ??= []).push(pageUrl);   // test hook, dev only
      pdf.addImage(pageUrl, 'PNG', MARGIN_X_IN, MARGIN_Y_IN, CONTENT_W_PX / DPI, (end - start) / DPI, undefined, 'FAST');
      first = false;
      start = end;
    }
    pdf.save(fileName);
  } finally {
    frame.remove();
  }
}
