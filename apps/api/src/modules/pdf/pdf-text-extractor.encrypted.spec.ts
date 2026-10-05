import { PdfExtractionError, PdfTextExtractor } from './pdf-text-extractor.service.js';

// pdf.js reports a password-protected file with an exception named PasswordException. Building a
// real encrypted PDF by hand is not worth it, so unpdf (the third-party boundary) is mocked.
vi.mock('unpdf', () => ({
  getDocumentProxy: vi.fn(() => {
    const error = new Error('No password given');
    error.name = 'PasswordException';
    return Promise.reject(error);
  }),
  extractText: vi.fn(),
}));

describe('PdfTextExtractor (password-protected)', () => {
  it('maps a PasswordException to the encrypted failure', async () => {
    const failure = await new PdfTextExtractor()
      .extract(Buffer.from('%PDF-1.7 anything'))
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(PdfExtractionError);
    expect(failure).toMatchObject({ kind: 'encrypted' });
  });
});
