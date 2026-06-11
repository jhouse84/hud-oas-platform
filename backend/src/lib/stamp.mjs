import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';

/**
 * Stamp a PDF with a diagonal watermark line plus footer lines on every page.
 * Returns the stamped bytes. Used by the upload-time base watermark and the
 * per-bidder on-demand watermark at presign time (VD-04).
 */
export async function stampPdf(bytes, { diagonal, footerLines = [] }) {
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();

  for (const page of pages) {
    const { width, height } = page.getSize();
    if (diagonal) {
      page.drawText(diagonal, {
        x: Math.max(40, width / 2 - Math.min(260, diagonal.length * 7)),
        y: height / 2,
        size: Math.min(26, Math.max(14, 600 / Math.max(1, diagonal.length / 4))),
        font,
        color: rgb(0.80, 0.80, 0.88),
        opacity: 0.30,
        rotate: degrees(30)
      });
    }
    footerLines.forEach((line, i) => {
      page.drawText(line, {
        x: 30,
        y: 18 + i * 11,
        size: 7.5,
        font,
        color: rgb(0.35, 0.35, 0.4)
      });
    });
  }
  return pdfDoc.save();
}
