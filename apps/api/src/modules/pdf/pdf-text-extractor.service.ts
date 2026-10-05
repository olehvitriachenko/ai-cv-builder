import { Injectable } from '@nestjs/common';
import { extractText, getDocumentProxy } from 'unpdf';
import { MAX_SOURCE_CHARS, MIN_SOURCE_CHARS } from '../../common/source-limits.js';

const PDF_SIGNATURE = Buffer.from('%PDF-', 'latin1');
const SIGNATURE_WINDOW = 1024;

/** The file type is decided by content, never by the file name or declared content type. */
export function hasPdfSignature(buffer: Buffer): boolean {
  return buffer.subarray(0, SIGNATURE_WINDOW).includes(PDF_SIGNATURE);
}

export type PdfExtractionFailure = 'unreadable' | 'encrypted' | 'empty' | 'too_long';

/** Carries only the failure kind; never document text or the underlying library message. */
export class PdfExtractionError extends Error {
  constructor(readonly kind: PdfExtractionFailure) {
    super(`PDF extraction failed: ${kind}`);
    this.name = 'PdfExtractionError';
  }
}

@Injectable()
export class PdfTextExtractor {
  /**
   * Text layer only (no OCR, no page images). Returns trimmed text of 50 to 20,000 characters, or
   * throws a PdfExtractionError. The bytes are discarded by the caller; nothing is stored here.
   */
  async extract(buffer: Buffer): Promise<string> {
    let text: string;
    try {
      // pdf.js can detach the buffer it is given, so it gets a copy.
      const document = await getDocumentProxy(new Uint8Array(buffer));
      try {
        text = (await extractText(document, { mergePages: true })).text;
      } finally {
        await document.loadingTask.destroy();
      }
    } catch (error) {
      throw new PdfExtractionError(
        error instanceof Error && error.name === 'PasswordException' ? 'encrypted' : 'unreadable',
      );
    }

    // NUL cannot be stored in a PostgreSQL text column.
    const trimmed = text.replaceAll('\u0000', '').trim();
    if (trimmed.length < MIN_SOURCE_CHARS) {
      throw new PdfExtractionError('empty');
    }
    if (trimmed.length > MAX_SOURCE_CHARS) {
      throw new PdfExtractionError('too_long');
    }
    return trimmed;
  }
}
