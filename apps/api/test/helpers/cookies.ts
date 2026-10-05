export interface ParsedCookie {
  name: string;
  value: string;
  /** Attribute names are lower-cased; flag attributes (HttpOnly, Secure) are `true`. */
  attributes: Record<string, string | true>;
}

function parseOne(header: string): ParsedCookie {
  const [pair = '', ...rest] = header.split(';').map((part) => part.trim());
  const separator = pair.indexOf('=');
  const attributes: Record<string, string | true> = {};

  for (const attribute of rest) {
    const index = attribute.indexOf('=');
    if (index === -1) {
      attributes[attribute.toLowerCase()] = true;
    } else {
      attributes[attribute.slice(0, index).toLowerCase()] = attribute.slice(index + 1);
    }
  }

  return {
    name: pair.slice(0, separator),
    value: pair.slice(separator + 1),
    attributes,
  };
}

/** Parses the `set-cookie` response header (a string, an array, or absent). */
export function parseSetCookie(header: string | string[] | number | undefined): ParsedCookie[] {
  if (header === undefined || typeof header === 'number') {
    return [];
  }
  return (Array.isArray(header) ? header : [header]).map(parseOne);
}

export function findSetCookie(
  header: string | string[] | number | undefined,
  name: string,
): ParsedCookie | undefined {
  return parseSetCookie(header).find((cookie) => cookie.name === name);
}

/** The value to send back in a request `cookie` header. */
export function toCookieHeader(cookie: ParsedCookie): string {
  return `${cookie.name}=${cookie.value}`;
}
