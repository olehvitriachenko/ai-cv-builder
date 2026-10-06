import { readFile } from 'node:fs/promises';
import { extractTextItems } from 'unpdf';
import { buildPositionedTextPdf, buildTextPdf } from '../../../test/helpers/pdf.js';
import { reconstructPageForInvestigation } from '../../../test/helpers/pdf-layout-prototype.js';
import { PdfTextExtractor } from './pdf-text-extractor.service.js';

const LEFT = ['CONTACT', 'Ada Lovelace', 'ada@example.com', '+44 20 7946 0958', 'SKILLS', 'Node.js, PostgreSQL'];
const RIGHT = ['EXPERIENCE', 'Acme Corp', 'Backend Engineer', '2019-2023', 'Built REST APIs using Node.js.', 'EDUCATION', 'State University'];

async function investigate(bytes: Buffer) {
  const { items } = await extractTextItems(new Uint8Array(bytes));
  return reconstructPageForInvestigation(items[0]!);
}

describe('PDF layout investigation (prototype only)', () => {
  it('preserves normal single-column text in full', async () => {
    const bytes = buildTextPdf([...LEFT, ...RIGHT]);
    const current = await new PdfTextExtractor().extract(bytes);
    const candidate = await investigate(bytes);
    expect(candidate).toEqual({ text: current, columns: 1, overlaps: false });
  });

  it.each([false, true])('separates columns and retains all facts (sidebar=%s)', async (sidebar) => {
    const bytes = buildPositionedTextPdf(RIGHT.flatMap((text, index) => [
      ...(LEFT[index] === undefined ? [] : [{ text: LEFT[index]!, x: 40, y: 800 - index * 20 }]),
      { text, x: 270, y: 800 - index * 20 },
    ]), sidebar);
    const current = await new PdfTextExtractor().extract(bytes);
    expect(current).toContain('+44 20 7946 0958 2019-2023');
    const candidate = await investigate(bytes);
    expect(candidate).toEqual({ text: [...LEFT, ...RIGHT].join('\n'), columns: 2, overlaps: false });
  });

  it('improves DOCX reading order but flags overlapping spans that still prevent safe rollout', async () => {
    const bytes = await readFile(new URL('../../../test/fixtures/pdf/docx-mixed-en-uk.pdf', import.meta.url));
    const current = await new PdfTextExtractor().extract(bytes);
    expect(current).not.toContain('Розробляла REST API на Node.js.');
    const candidate = await investigate(bytes);
    expect(candidate.text).toContain('Розробляла REST API на Node.js.');
    expect(candidate.text).toContain('Київський політехнічний інститут');
    expect(candidate.overlaps).toBe(true);
    expect(candidate.columns).toBe(1);
  });
});
