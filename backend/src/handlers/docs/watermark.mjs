import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';

const s3 = new S3Client({ region: process.env.REGION });
const BUCKET = process.env.BUCKET_DOCS;

/**
 * S3 trigger: when a file lands under originals/{saleId}/{filename},
 * generate a base watermarked PDF under watermarked/{saleId}/_base/{filename}.
 * Per-bidder watermarks are applied on-demand at presign time (future iteration);
 * for now, the base watermark stamps "HUD OAS Transaction Platform — CONFIDENTIAL".
 */
export const handler = async (event) => {
  for (const record of event.Records || []) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    if (!key.startsWith('originals/')) continue;
    if (!/\.pdf$/i.test(key)) {
      console.log('Skipping non-PDF:', key);
      continue;
    }

    try {
      const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const bytes = await streamToBuffer(obj.Body);

      const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const pages = pdfDoc.getPages();
      const stamp = 'HUD OAS Transaction Platform — CONFIDENTIAL';

      for (const page of pages) {
        const { width, height } = page.getSize();
        // Diagonal watermark
        page.drawText(stamp, {
          x: width / 2 - 180,
          y: height / 2,
          size: 28,
          font,
          color: rgb(0.85, 0.85, 0.9),
          opacity: 0.25,
          rotate: degrees(30)
        });
        // Footer stamp
        page.drawText(`Retrieved ${new Date().toISOString()}`, {
          x: 30,
          y: 18,
          size: 8,
          font,
          color: rgb(0.35, 0.35, 0.4)
        });
      }

      const stamped = await pdfDoc.save();
      const outKey = key.replace(/^originals\//, 'watermarked/_base/');

      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: outKey,
        Body: stamped,
        ContentType: 'application/pdf',
        ServerSideEncryption: 'aws:kms',
        SSEKMSKeyId: process.env.KMS_KEY_ID,
        Metadata: { 'source-key': key, 'watermark-version': '1' }
      }));

      console.log(`Watermarked ${key} → ${outKey}`);
    } catch (err) {
      console.error('Watermark failed', { key, error: err.message, stack: err.stack });
    }
  }
  return { ok: true };
};

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}
