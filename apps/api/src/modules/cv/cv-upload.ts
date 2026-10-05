import type { FastifyRequest } from 'fastify';
import { errorCode } from '../../common/errors.js';
import { ApiError, type FieldErrors } from '../../common/http/api-error.js';
import { MAX_PDF_BYTES } from '../../common/source-limits.js';
import { hasPdfSignature } from '../pdf/pdf-text-extractor.service.js';
import { targetRoleSchema } from './cv.schemas.js';

export interface PdfUploadInput {
  targetRole: string;
  buffer: Buffer;
}

function validationError(fieldErrors: FieldErrors): ApiError {
  return new ApiError(400, 'VALIDATION_ERROR', 'Invalid request', fieldErrors);
}

/** Multipart failures from @fastify/multipart carry an `FST_*` code (too many files, fields, ...). */
function multipartErrorCode(error: unknown): string | undefined {
  const code = errorCode(error);
  return code?.startsWith('FST_') ? code : undefined;
}

/**
 * Reads and validates the multipart upload: a `targetRole` field plus exactly one `file` part, and
 * no `sourceText` (exactly one source is allowed). Everything is collected first (the plugin's
 * limits bound memory) and then validated, so all problems are reported together.
 *
 * The file type is decided by content (PDF signature), never by the name or declared type.
 */
export async function readPdfUpload(request: FastifyRequest): Promise<PdfUploadInput> {
  if (!request.isMultipart()) {
    throw validationError({ file: ['Upload a PDF as multipart/form-data'] });
  }

  const fields = new Map<string, string>();
  let file: { buffer: Buffer; truncated: boolean } | undefined;

  try {
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        const buffer = await part.toBuffer();
        if (part.fieldname === 'file') {
          file = { buffer, truncated: part.file.truncated };
        }
      } else if (typeof part.value === 'string') {
        fields.set(part.fieldname, part.value);
      }
    }
  } catch (error) {
    const code = multipartErrorCode(error);
    if (code === undefined) {
      throw error;
    }
    throw validationError({
      file: [code === 'FST_FILES_LIMIT' ? 'Exactly one file is allowed' : 'Invalid upload request'],
    });
  }

  const errors: FieldErrors = {};

  const role = targetRoleSchema.safeParse(fields.get('targetRole'));
  if (!role.success) {
    errors.targetRole = role.error.issues.map((issue) => issue.message);
  }

  if (fields.has('sourceText')) {
    errors.source = ['Provide either free text or a PDF, not both'];
  }

  if (!file) {
    errors.file = ['A PDF file is required'];
  } else if (file.truncated || file.buffer.length > MAX_PDF_BYTES) {
    errors.file = [`PDF must be ${MAX_PDF_BYTES / (1024 * 1024)} MB or smaller`];
  } else if (!hasPdfSignature(file.buffer)) {
    errors.file = ['Only PDF files are accepted'];
  }

  if (!role.success || !file || Object.keys(errors).length > 0) {
    throw validationError(errors);
  }
  return { targetRole: role.data, buffer: file.buffer };
}
