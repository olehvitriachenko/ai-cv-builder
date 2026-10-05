/** Escapes the characters that are special inside a PDF literal string. */
function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Assembles one content stream per page into a valid PDF with a correct xref table. */
function assemble(pageStreams: string[]): Buffer {
  const pageCount = pageStreams.length;
  const fontNumber = 3 + pageCount * 2;
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageStreams.map((_, i) => `${3 + i * 2} 0 R`).join(' ')}] /Count ${pageCount} >>`,
  ];
  pageStreams.forEach((stream, i) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${fontNumber} 0 R >> >> >>`,
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    );
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(body, 'latin1');
}

const LINES_PER_PAGE = 55;

/** A real PDF whose text layer holds the given lines (ASCII only), 55 lines per page. */
export function buildTextPdf(lines: string[], linesPerPage = LINES_PER_PAGE): Buffer {
  const pages: string[] = [];
  for (let start = 0; start < Math.max(lines.length, 1); start += linesPerPage) {
    const text = lines
      .slice(start, start + linesPerPage)
      .map((line) => `(${escapePdfText(line)}) Tj T*`)
      .join('\n');
    pages.push(`BT /F1 10 Tf 12 TL 40 800 Td\n${text}\nET`);
  }
  return assemble(pages);
}

/** A valid PDF whose page has no text at all, like a scanned image-only document. */
export function buildEmptyTextPdf(): Buffer {
  return assemble(['']);
}

/** Starts like a PDF (so it passes the signature check) but its structure is broken. */
export function buildCorruptPdf(): Buffer {
  return Buffer.from('%PDF-1.4\nthis is not a real pdf structure at all\n', 'latin1');
}
