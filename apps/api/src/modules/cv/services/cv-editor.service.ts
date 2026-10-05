import { Injectable } from '@nestjs/common';
import { ApiError } from '../../../common/http/api-error.js';
import { PrismaService } from '../../../infrastructure/index.js';
import type { CvDraftEditBody } from '../schemas/draft-edit.schema.js';
import { CvService } from './cv.service.js';

export interface DraftSaveResponse {
  /** The new revision: send it with the next save. */
  revision: number;
  updatedAt: Date;
}

/**
 * Manual editing of a COMPLETED CV's draft. The body has already been validated with the draft
 * schema; this class only decides whether the write may happen.
 */
@Injectable()
export class CvEditorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cvs: CvService,
  ) {}

  /**
   * One conditional UPDATE: it matches the owner, the COMPLETED status and the revision the edit
   * was based on, and advances the revision. The check and the write are a single statement, so two
   * saves on the same revision cannot both succeed and a stale save writes nothing.
   *
   * When no row matches, one owned read explains why: a foreign or missing CV is the usual 404, a
   * CV that is not COMPLETED has no editable draft (409), otherwise the revision was stale (409).
   */
  async updateDraft(userId: string, cvId: string, body: CvDraftEditBody): Promise<DraftSaveResponse> {
    const [saved] = await this.prisma.cv.updateManyAndReturn({
      where: {
        id: cvId,
        userId,
        generationStatus: 'COMPLETED',
        revision: body.revision,
      },
      data: { draft: body.draft, revision: { increment: 1 } },
      select: { revision: true, updatedAt: true },
    });
    if (saved) {
      return saved;
    }

    const current = await this.cvs.findOwnedOrThrow(userId, cvId);
    if (current.status !== 'COMPLETED') {
      throw new ApiError(409, 'CV_NOT_EDITABLE', 'Only a completed CV can be edited');
    }
    throw new ApiError(
      409,
      'REVISION_CONFLICT',
      'The CV changed since you loaded it. Reload to see the latest version.',
    );
  }
}
