import { Injectable } from '@nestjs/common';
import { ApiError } from '../../common/http/api-error.js';
import { PrismaService } from '../../infrastructure/index.js';
import type { CreateCvInput } from './cv.schemas.js';

/** Public shape of a CV. Deliberately has no `userId`. */
export interface CvResponse {
  id: string;
  targetRole: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const CV_SELECT = { id: true, targetRole: true, createdAt: true, updatedAt: true } as const;

@Injectable()
export class CvService {
  constructor(private readonly prisma: PrismaService) {}

  /** The owner is always the authenticated user passed in, never a value from the request. */
  create(userId: string, input: CreateCvInput): Promise<CvResponse> {
    return this.prisma.cv.create({
      data: { userId, targetRole: input.targetRole ?? null },
      select: CV_SELECT,
    });
  }

  /**
   * The single ownership gate for CV reads. The owner is part of the query, so "not found" and
   * "not owned" are the same code path and the same response (no existence leak).
   *
   * All future read, update, delete, generation, clarification and export operations MUST load
   * the CV through this method (FR-031).
   */
  async findOwnedOrThrow(userId: string, cvId: string): Promise<CvResponse> {
    const cv = await this.prisma.cv.findFirst({
      where: { id: cvId, userId },
      select: CV_SELECT,
    });

    if (!cv) {
      throw new ApiError(404, 'CV_NOT_FOUND', 'CV not found');
    }
    return cv;
  }
}
