import { indexSource, tokenize } from './source-matching.js';

describe('tokenize', () => {
  it('lower-cases, drops punctuation and treats & as and', () => {
    expect(tokenize('Johnson & Johnson, Inc.')).toEqual(['johnson', 'and', 'johnson', 'inc']);
  });

  it('is Unicode-aware: composed and decomposed forms, fullwidth forms and other scripts', () => {
    expect(tokenize('Zürich')).toEqual(tokenize('Zürich'));
    expect(tokenize('ＡＣＭＥ')).toEqual(['acme']);
    expect(tokenize('Яндекс')).toEqual(['яндекс']);
    expect(tokenize('東京大学')).toEqual(['東京大学']);
  });
});

describe('contact details (strict)', () => {
  const source = indexSource(
    [
      'Ada Lovelace — Contact: Ada@Example.com, tel +1 (415) 555-0132.',
      'Profiles: https://www.github.com/ada-l/ and linkedin.com/in/ada',
      'Years: 2016 2023 2024',
    ].join('\n'),
  );

  describe('email', () => {
    it('accepts an address present in the source, ignoring case', () => {
      expect(source.hasEmail('ada@example.com')).toBe(true);
      expect(source.hasEmail('ADA@EXAMPLE.COM')).toBe(true);
    });

    it('rejects an address that is not in the source', () => {
      expect(source.hasEmail('grace@example.com')).toBe(false);
      expect(source.hasEmail('')).toBe(false);
    });

    it('rejects an address that is only part of a longer one', () => {
      expect(indexSource('write to nada@example.com').hasEmail('ada@example.com')).toBe(false);
      expect(indexSource('write to ada@example.com.au').hasEmail('ada@example.com')).toBe(false);
    });

    it('accepts a trailing sentence period and a mailto prefix', () => {
      expect(indexSource('Mail me: ada@example.com.').hasEmail('ada@example.com')).toBe(true);
      expect(indexSource('mailto:ada@example.com').hasEmail('ada@example.com')).toBe(true);
    });
  });

  describe('phone', () => {
    it('ignores formatting differences', () => {
      expect(source.hasPhone('+1 415 555 0132')).toBe(true);
      expect(source.hasPhone('+1 (415) 555-0132')).toBe(true);
      expect(source.hasPhone('14155550132')).toBe(true);
    });

    it('rejects a number that is not in the source', () => {
      expect(source.hasPhone('+1 415 555 9999')).toBe(false);
    });

    it.each(['(415) 555-0132', '5550132', '1415555'])('rejects a partial number: %s', (phone) => {
      expect(source.hasPhone(phone)).toBe(false);
    });

    it('rejects a truncated number even when its digits occur in the source', () => {
      expect(indexSource('Phone: +44 20 7946 0958').hasPhone('79460958')).toBe(false);
      expect(indexSource('Phone: +44 20 7946 0958').hasPhone('44 (20) 7946-0958')).toBe(true);
    });

    it('rejects values with too few digits to be checked', () => {
      expect(source.hasPhone('2016')).toBe(false);
      expect(source.hasPhone('no digits')).toBe(false);
    });

    it('does not assemble a number from digits on different lines', () => {
      const split = indexSource('call 415 555\n0132 later');
      expect(split.hasPhone('4155550132')).toBe(false);
    });

    it('is Unicode-aware: fullwidth digits normalise, other digit scripts match their own script', () => {
      expect(indexSource('Tel: ０４１５５５０１３２').hasPhone('0415550132')).toBe(true);
      expect(indexSource('هاتف ٠٥٥٥١٢٣٤٥٦٧').hasPhone('٠٥٥٥١٢٣٤٥٦٧')).toBe(true);
      expect(indexSource('هاتف ٠٥٥٥١٢٣٤٥٦٧').hasPhone('٠٥٥٥١٢٣٤٥٦٨')).toBe(false);
    });
  });

  describe('links', () => {
    it('ignores scheme, www and a trailing slash', () => {
      expect(source.hasLink('github.com/ada-l')).toBe(true);
      expect(source.hasLink('https://github.com/ada-l')).toBe(true);
      expect(source.hasLink('http://www.github.com/ada-l/')).toBe(true);
      expect(source.hasLink('https://www.linkedin.com/in/ada/')).toBe(true);
    });

    it('rejects a link that is not in the source', () => {
      expect(source.hasLink('https://github.com/grace')).toBe(false);
      expect(source.hasLink('https://example.org')).toBe(false);
    });

    it('rejects a truncated path, an extended path and a different host', () => {
      expect(source.hasLink('github.com/ada')).toBe(false);
      expect(source.hasLink('github.com/ada-l/repo')).toBe(false);
      expect(source.hasLink('api.github.com/ada-l')).toBe(false);
    });

    it('does not mistake an email domain for a link', () => {
      expect(source.hasLink('example.com')).toBe(false);
    });
  });
});

describe('person name', () => {
  it('accepts reordered and middle-name variants near each other', () => {
    expect(indexSource('Lovelace, Ada').hasPersonName('Ada Lovelace')).toBe(true);
    expect(indexSource('Ada King Lovelace').hasPersonName('Ada Lovelace')).toBe(true);
  });

  it('rejects a name that is not there or whose parts are far apart', () => {
    expect(indexSource('Ada Lovelace').hasPersonName('Grace Hopper')).toBe(false);
    expect(indexSource(`Ada ${'filler '.repeat(10)} Hopper`).hasPersonName('Ada Hopper')).toBe(
      false,
    );
  });

  it('ignores one-letter initials but still needs the real parts', () => {
    expect(indexSource('Ada Lovelace').hasPersonName('A. Lovelace')).toBe(true);
    expect(indexSource('Ada Lovelace').hasPersonName('A. Hopper')).toBe(false);
  });
});

describe('organisation names (tolerant of formatting, strict about names)', () => {
  it.each([
    ['capitalisation', 'ACME CORP', 'Worked at Acme Corp in London'],
    ['punctuation', 'Acme, Corp.', 'Worked at Acme Corp in London'],
    ['a legal suffix added', 'Acme Inc.', 'Worked at Acme in London'],
    ['a legal suffix changed', 'Acme Corporation', 'Worked at Acme Corp in London'],
    ['a legal suffix dropped', 'Acme', 'Worked at Acme Corp in London'],
    ['word order', 'Oslo University', 'BSc, University of Oslo, 2015'],
    ['an ampersand', 'Smith & Sons', 'Smith and Sons Ltd, 2010'],
    ['Unicode case and composition', 'MÜLLER GMBH', 'Müller GmbH Berlin'],
    ['another script', 'ЯНДЕКС', 'Работал в Яндекс'],
    ['fullwidth letters', 'ＡＣＭＥ', 'Acme'],
  ])('accepts a name that only differs by %s', (_label, name, source) => {
    expect(indexSource(source).hasOrganisation(name)).toBe(true);
  });

  it('rejects a name with no counterpart in the source', () => {
    expect(indexSource('Worked at Acme Corp in London').hasOrganisation('Globex')).toBe(false);
  });

  it('rejects a name that is missing one significant token', () => {
    expect(indexSource('Worked at Acme Corp').hasOrganisation('Acme Robotics')).toBe(false);
    expect(indexSource('BSc, University of Oslo').hasOrganisation('University of Bergen')).toBe(
      false,
    );
  });

  it('rejects a single-token name absent from the source', () => {
    expect(indexSource('Worked at Acme Corp').hasOrganisation('Initech')).toBe(false);
  });

  it('rejects a name assembled from words scattered across the source (local window)', () => {
    const source = `Acme sells tools. ${'We also did many other things for clients. '.repeat(5)} Our Labs team grew.`;

    expect(indexSource(source).hasOrganisation('Acme Labs')).toBe(false);
    expect(indexSource('Acme Labs, 2020').hasOrganisation('Acme Labs')).toBe(true);
  });

  it('does not expand abbreviations or match acronyms: names must be copied as written', () => {
    expect(indexSource('University of Oslo').hasOrganisation('Univ. of Oslo')).toBe(false);
    expect(indexSource('MIT').hasOrganisation('Massachusetts Institute of Technology')).toBe(false);
    expect(indexSource('Massachusetts Institute of Technology').hasOrganisation('MIT')).toBe(false);
  });

  it('does not strip diacritics: a changed spelling is unsupported', () => {
    expect(indexSource('Zürich Insurance').hasOrganisation('Zurich Insurance')).toBe(false);
  });

  it('never accepts an empty name', () => {
    expect(indexSource('Acme').hasOrganisation('')).toBe(false);
    expect(indexSource('Acme').hasOrganisation('  .,  ')).toBe(false);
  });

  it('falls back to all tokens when a name is only legal words', () => {
    expect(indexSource('The Company').hasOrganisation('The Company')).toBe(true);
    expect(indexSource('Acme').hasOrganisation('The Company')).toBe(false);
  });
});
