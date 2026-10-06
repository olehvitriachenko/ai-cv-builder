/** Matches the editor's year/month precision without inventing an end date. */
export function educationStatus(end: string | null, today = new Date()): { studying: boolean; expected: boolean } {
  const value = end?.trim().toLowerCase() ?? '';
  if (value === 'present') return { studying: true, expected: false };
  let year: number | undefined;
  let month: number | undefined;
  if (/^\d{4}$/u.test(value)) year = Number(value);
  const iso = /^(\d{4})-(\d{2})$/u.exec(value);
  const reverse = /^(\d{1,2})[/.](\d{4})$/u.exec(value);
  if (iso || reverse) {
    year = Number(iso ? iso[1] : reverse?.[2]);
    month = Number(iso ? iso[2] : reverse?.[1]);
  }
  const named = /^([\p{L}.]+)\s+(\d{4})$/u.exec(value);
  if (named) {
    const names = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const ukrainian = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];
    const token = named[1]!.replace(/\.$/u, '');
    const index = names.findIndex((name, i) => token === name || token === name.slice(0, 3) || (token.length >= 3 && token.startsWith(ukrainian[i]!)));
    if (index >= 0) { year = Number(named[2]); month = index + 1; }
  }
  const valid = year !== undefined && (month === undefined || (month >= 1 && month <= 12));
  const expected = valid && (year! > today.getFullYear() || (year === today.getFullYear() && month !== undefined && month > today.getMonth() + 1));
  return { studying: expected, expected };
}
