import { randomUUID } from 'node:crypto';

export interface MultipartFile {
  fieldName?: string;
  filename: string;
  contentType: string;
  data: Buffer;
}

export interface MultipartBody {
  payload: Buffer;
  headers: { 'content-type': string };
}

/** Builds a `multipart/form-data` body for `app.inject()`; fields first, then the optional file. */
export function buildMultipart(
  fields: Record<string, string>,
  file?: MultipartFile,
): MultipartBody {
  const boundary = `----test-${randomUUID()}`;
  const chunks: Buffer[] = [];

  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        'utf8',
      ),
    );
  }

  if (file) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName ?? 'file'}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
        'utf8',
      ),
      file.data,
      Buffer.from('\r\n', 'utf8'),
    );
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));

  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}
