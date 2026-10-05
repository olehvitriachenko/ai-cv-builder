import { contentDisposition, pdfFilename } from './pdf-filename.js';

describe('pdfFilename', () => {
  it('joins the candidate name and the role', () => {
    expect(pdfFilename('Ada Lovelace', 'Backend Engineer')).toEqual({
      ascii: 'Ada-Lovelace-Backend-Engineer.pdf',
      utf8: 'Ada-Lovelace-Backend-Engineer.pdf',
    });
  });

  it('uses only the role when the name is missing, and CV when nothing usable remains', () => {
    expect(pdfFilename(null, 'Backend Engineer').utf8).toBe('Backend-Engineer.pdf');
    expect(pdfFilename('', '   ').utf8).toBe('CV.pdf');
    expect(pdfFilename(null, '///').ascii).toBe('CV.pdf');
  });

  it('removes path separators, quotes, control characters and dots', () => {
    const { ascii, utf8 } = pdfFilename('../../etc/passwd', 'Eng"ineer\u0000\r\n;\\');
    for (const name of [ascii, utf8]) {
      for (const char of name) {
        expect(
          char.charCodeAt(0),
          `${JSON.stringify(name)} has a control character`,
        ).toBeGreaterThan(31);
        expect('/\\"\';:'.includes(char), `${JSON.stringify(name)} has an unsafe character`).toBe(
          false,
        );
      }
      expect(name).not.toContain('..');
      expect(name.endsWith('.pdf')).toBe(true);
      // Exactly one dot: the extension.
      expect(name.split('.').length).toBe(2);
    }
  });

  it('drops emoji and symbols', () => {
    expect(pdfFilename('Ada 🚀 Lovelace', 'Dev ✨').utf8).toBe('Ada-Lovelace-Dev.pdf');
  });

  it('collapses repeated separators and trims them', () => {
    expect(pdfFilename('  Ada   Lovelace  ', '--Dev--').utf8).toBe('Ada-Lovelace-Dev.pdf');
  });

  it('bounds the length (80 characters before the extension) without a dangling dash', () => {
    const long = pdfFilename('A'.repeat(200), 'Engineer');
    expect(long.utf8.length).toBeLessThanOrEqual(80 + '.pdf'.length);
    expect(long.ascii.length).toBeLessThanOrEqual(80 + '.pdf'.length);
    expect(long.utf8).not.toMatch(/-\.pdf$/);
  });

  it('keeps Cyrillic in the UTF-8 name and falls back to ASCII for the plain name', () => {
    const file = pdfFilename('Олена Іваненко', 'Backend Engineer');
    expect(file.utf8).toBe('Олена-Іваненко-Backend-Engineer.pdf');
    expect(file.ascii).toBe('Backend-Engineer.pdf');
  });

  it('transliterates Latin diacritics in the ASCII name', () => {
    expect(pdfFilename('José Núñez', 'Dev').ascii).toBe('Jose-Nunez-Dev.pdf');
    expect(pdfFilename('José Núñez', 'Dev').utf8).toBe('José-Núñez-Dev.pdf');
  });

  it('gives CV.pdf as the ASCII name when only non-Latin text was supplied', () => {
    const file = pdfFilename('Олена', 'Інженер');
    expect(file.ascii).toBe('CV.pdf');
    expect(file.utf8).toBe('Олена-Інженер.pdf');
  });
});

describe('contentDisposition', () => {
  it('is an attachment with a quoted ASCII name and a percent-encoded UTF-8 name', () => {
    const header = contentDisposition(pdfFilename('Олена Іваненко', 'Backend Engineer'));
    expect(header).toBe(
      `attachment; filename="Backend-Engineer.pdf"; filename*=UTF-8''${encodeURIComponent('Олена-Іваненко-Backend-Engineer.pdf')}`,
    );
  });

  it('never contains a raw non-ASCII character or a quote inside the values', () => {
    const header = contentDisposition(pdfFilename('José "Ñ" Núñez', 'Dev'));
    expect(header).toMatch(/^[\x20-\x7e]+$/);
    const quoted = header.match(/filename="([^"]*)"/);
    expect(quoted?.[1]).toBe('Jose-N-Nunez-Dev.pdf');
  });
});
