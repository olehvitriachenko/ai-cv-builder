/**
 * A web address, with or without `https://`: no spaces, http or https only, and a dotted host. The
 * same rule as the editor's link fields (`links.ts` in the web app), enforced again here because
 * the server never trusts the client.
 */
export function isWebAddress(value: string): boolean {
  const text = value.trim();
  if (text === '' || /\s/u.test(text)) {
    return false;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//iu.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.');
  } catch {
    return false;
  }
}
