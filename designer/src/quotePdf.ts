// Web build: turn the quote HTML into a real PDF file and download it — no print dialog, works in any browser.
// (The Electron build keeps webContents.printToPDF.) Renders the quote in an off-screen frame at Letter-landscape
// content width, rasterizes it at 2× with html2canvas, and slices it into pages at safe break points (top of a
// unit card or table row) so a unit's drawing never splits across pages. The libraries load only on export.

const DPI = 96;                                   // CSS px per inch
const PAGE_W_IN = 11, PAGE_H_IN = 8.5;            // Letter landscape — matches the quote's @page
const MARGIN_X_IN = 0.6, MARGIN_Y_IN = 0.5;
const CONTENT_W_PX = Math.round((PAGE_W_IN - 2 * MARGIN_X_IN) * DPI);
const CONTENT_H_PX = Math.round((PAGE_H_IN - 2 * MARGIN_Y_IN) * DPI);
const SCALE = 2;

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

    const canvas = await html2canvas(doc.body, {
      scale: SCALE, backgroundColor: '#ffffff', useCORS: true,
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
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN_X_IN, MARGIN_Y_IN, CONTENT_W_PX / DPI, (end - start) / DPI);
      first = false;
      start = end;
    }
    pdf.save(fileName);
  } finally {
    frame.remove();
  }
}
