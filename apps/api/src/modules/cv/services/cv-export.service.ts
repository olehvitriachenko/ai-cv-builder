import { Injectable, Logger } from '@nestjs/common';
import { describeError } from '../../../common/errors.js';
import { ApiError } from '../../../common/http/api-error.js';
import { PrismaService } from '../../../infrastructure/index.js';
import { CvPdfRenderer } from '../../pdf/export/cv-pdf-renderer.service.js';
import { pdfFilename, type PdfFilename } from '../../pdf/export/pdf-filename.js';
import { cvDraftSchema } from '../generation/draft.schema.js';
import { CvService } from './cv.service.js';

export interface CvPdfFile {
  bytes: Buffer;
  filename: PdfFilename;
}

/**
 * Exports the latest saved draft of an owned, COMPLETED CV as a PDF.
 *
 * Read-only. The renderer receives only the draft and the target role: the query below does not
 * select clarification questions, answers, the source text or any internal field, so none of it
 * can reach the document.
 */
@Injectable()
export class CvExportService {
  private readonly logger = new Logger(CvExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cvs: CvService,
    private readonly renderer: CvPdfRenderer,
  ) {}

  async export(userId: string, cvId: string): Promise<CvPdfFile> {
    const started = Date.now();
    const notReady = new ApiError(
      409,
      'GENERATION_NOT_READY',
      'The CV has not finished generating',
    );

    // The same ownership gate as every CV read: foreign and missing are one 404.
    const status = await this.cvs.findOwnedOrThrow(userId, cvId);
    if (status.status !== 'COMPLETED') {
      throw notReady;
    }

    // Read once; the document is rendered from this snapshot, never from a cached earlier export.
    const cv = await this.prisma.cv.findFirst({
      where: { id: cvId, userId, generationStatus: 'COMPLETED' },
      select: { targetRole: true, draft: true },
    });
    if (!cv) {
      throw notReady;
    }

    try {
      // Database JSON is an external boundary: parse it again before it is laid out.
      const draft = cvDraftSchema.parse(cv.draft);
      const bytes = await this.renderer.render({ draft, targetRole: cv.targetRole });
      this.logger.log(
        `event=cv_pdf_exported cvId=${cvId} bytes=${bytes.length} durationMs=${Date.now() - started}`,
      );
      return { bytes, filename: pdfFilename(draft.contact.fullName, cv.targetRole) };
    } catch (error) {
      // Category only: the draft, role and name are personal data and never logged.
      this.logger.error(`event=cv_pdf_failed cvId=${cvId} error=${describeError(error)}`);
      throw error;
    }
  }
}
