import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument, PDFDict, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { loadSource } from './helpers/rg-fixtures.mjs';

const contracts = loadSource('lib/commerce/contracts.ts');
const params = {
  orderId: '00000000-0000-0000-0000-000000000001',
  customerName: 'Recipient Legal Name', customerEmail: 'recipient@example.test',
  purchaserName: 'Payer Legal Name', isGift: true,
  beatTitle: 'Watermark Preview', beatId: 'preview-beat', amountPaid: 29,
  purchaseDate: '2026-10-07T12:00:00Z', licenseId: 'RG-MP3-2026-000001',
};

for (const tier of ['mp3', 'wav', 'unlimited', 'exclusive']) {
  test(`${tier}: every PDF page has the same faint logo behind selectable contract text`, async () => {
    const bytes = await contracts.generateContractPdfBuffer({ ...params, licenseTier: tier });
    const pdf = await PDFDocument.load(bytes);
    assert.ok(pdf.getPageCount() > 1, 'check both certificate and agreement pages');
    const imageRefs = new Set();
    for (const page of pdf.getPages()) {
      const resources = page.node.Resources();
      const images = resources.lookup(PDFName.of('XObject'), PDFDict);
      assert.equal(images.keys().length, 1);
      const imageRef = images.get(images.keys()[0]);
      imageRefs.add(imageRef.toString());
      const image = pdf.context.lookup(imageRef, PDFRawStream);
      assert.equal(image.dict.get(PDFName.of('Width')).asNumber(), 979);
      assert.equal(image.dict.get(PDFName.of('Height')).asNumber(), 345);
      assert.equal(image.dict.get(PDFName.of('Decode')).toString(), '[ 1 0 1 0 1 0 ]', 'white logo renders dark while original alpha is preserved');
      assert.ok(image.dict.get(PDFName.of('SMask')), 'transparent background must remain transparent');
      const graphicsStates = resources.lookup(PDFName.of('ExtGState'), PDFDict);
      assert.ok(graphicsStates.values().some(ref => pdf.context.lookup(ref, PDFDict).get(PDFName.of('ca'))?.asNumber() === 0.08), 'faint opacity preserves readability');
      const contents = page.node.Contents();
      const operators = Array.from({length: contents.size()}, (_, i) =>
        Buffer.from(decodePDFRawStream(contents.lookup(i, PDFRawStream)).decode()).toString()).join('\n');
      assert.ok(operators.indexOf(' Do') < operators.indexOf('BT'), 'watermark must be drawn under the text');
      assert.ok(operators.includes(' Tj'), 'contract text remains actual searchable text');
      assert.equal(page.getWidth(), 612); assert.equal(page.getHeight(), 792);
    }
    assert.equal(imageRefs.size, 1, 'reuse the logo across pages without duplicating the image');
    if (process.env.CONTRACT_PREVIEW_DIR && ['mp3', 'exclusive'].includes(tier)) {
      await mkdir(process.env.CONTRACT_PREVIEW_DIR, {recursive:true});
      await writeFile(join(process.env.CONTRACT_PREVIEW_DIR, `contract-${tier}-watermark.pdf`), bytes);
    }
  });
}
