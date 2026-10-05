import { buildCorruptPdf, buildEmptyTextPdf, buildTextPdf } from '../../../test/helpers/pdf.js';
import {
  PdfExtractionError,
  PdfTextExtractor,
  hasPdfSignature,
} from './pdf-text-extractor.service.js';

const GOOD_LINES = [
  'Jane Doe - Backend Engineer',
  'Acme Corp, 2019-2023: built REST APIs in Node.js and PostgreSQL',
];

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe('PdfTextExtractor', () => {
  const extractor = new PdfTextExtractor();

  it('extracts trimmed text from a valid text PDF', async () => {
    const text = await extractor.extract(buildTextPdf(GOOD_LINES));

    expect(text).toContain('Jane Doe - Backend Engineer');
    expect(text).toContain('Acme Corp, 2019-2023');
    expect(text).toBe(text.trim());
  });

  it('reports a PDF with a signature but a broken structure as unreadable', async () => {
    const failure = await failureOf(extractor.extract(buildCorruptPdf()));

    expect(failure).toBeInstanceOf(PdfExtractionError);
    expect(failure).toMatchObject({ kind: 'unreadable' });
  });

  it('reports a PDF without any text (image-only) as empty', async () => {
    const failure = await failureOf(extractor.extract(buildEmptyTextPdf()));

    expect(failure).toMatchObject({ kind: 'empty' });
  });

  it('reports text shorter than 50 characters as empty', async () => {
    const failure = await failureOf(extractor.extract(buildTextPdf(['Too short'])));

    expect(failure).toMatchObject({ kind: 'empty' });
  });

  it('reports text longer than 20,000 characters as too_long', async () => {
    const lines = Array.from({ length: 300 }, (_, i) => `Line ${i} ${'x'.repeat(80)}`);

    const failure = await failureOf(extractor.extract(buildTextPdf(lines)));

    expect(failure).toMatchObject({ kind: 'too_long' });
  });

  it('never puts document text into the error', async () => {
    const failure = await failureOf(extractor.extract(buildTextPdf(['Secret résumé text'])));

    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).not.toContain('Secret');
    expect(JSON.stringify(failure)).not.toContain('Secret');
  });

  it('accepts exactly 50 pages with usable text', async () => {
    const text = await extractor.extract(
      buildTextPdf(
        Array.from({ length: 50 }, () => 'CV fact'),
        1,
      ),
    );
    expect(text).toContain('CV fact');
  });

  it('rejects 51 pages even when both file and extracted text are small', async () => {
    const failure = await failureOf(
      extractor.extract(
        buildTextPdf(
          Array.from({ length: 51 }, () => 'CV fact'),
          1,
        ),
      ),
    );
    expect(failure).toMatchObject({ kind: 'too_many_pages' });
  });
});

describe('hasPdfSignature', () => {
  it('is true when %PDF- starts the file or appears within the first 1,024 bytes', () => {
    expect(hasPdfSignature(Buffer.from('%PDF-1.7\n...'))).toBe(true);
    expect(
      hasPdfSignature(Buffer.concat([Buffer.alloc(1000, 0x20), Buffer.from('%PDF-1.4')])),
    ).toBe(true);
  });

  it('is false for any other bytes, including a renamed text file', () => {
    expect(hasPdfSignature(Buffer.from('just some text'))).toBe(false);
    expect(hasPdfSignature(Buffer.alloc(0))).toBe(false);
    expect(
      hasPdfSignature(Buffer.concat([Buffer.alloc(1100, 0x20), Buffer.from('%PDF-1.4')])),
    ).toBe(false);
    expect(hasPdfSignature(Buffer.from('PK\u0003\u0004 zip'))).toBe(false);
  });
});
