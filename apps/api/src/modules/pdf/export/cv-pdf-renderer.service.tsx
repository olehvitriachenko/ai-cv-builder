import { Injectable } from '@nestjs/common';
import { renderToBuffer } from '@react-pdf/renderer';
import { CvPdfDocument, type CvPdfDocumentProps } from './cv-pdf.document.js';
import { registerPdfFonts } from './cv-pdf.fonts.js';

/** Everything the renderer ever receives: the draft and the target role. No ids, no questions. */
export type CvPdfInput = CvPdfDocumentProps;

/**
 * Renders the CV template to an A4 PDF with selectable text. A pure function of its input: it knows
 * nothing about users, ownership, HTTP or the database.
 *
 * Renders run one at a time. The underlying renderer shares font state process-wide, and two
 * documents built at once corrupt each other's text layer. A render takes a few hundred
 * milliseconds, so queueing is the simplest correct choice at this scale.
 */
@Injectable()
export class CvPdfRenderer {
  private queue: Promise<unknown> = Promise.resolve();

  render(input: CvPdfInput): Promise<Buffer> {
    const result = this.queue.then(() => this.renderNow(input));
    // A failed render must not block the ones queued behind it.
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async renderNow(input: CvPdfInput): Promise<Buffer> {
    registerPdfFonts();
    return renderToBuffer(<CvPdfDocument draft={input.draft} targetRole={input.targetRole} />);
  }
}
