/** Exact source checks for explicit facts; no semantic judgement of prose. */
function normalized(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{Pd}]/gu, '-')
    .replace(/\s+/gu, ' ')
    .trim();
}
function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
export function containsFact(source: string, value: string): boolean {
  const fact = normalized(value);
  return (
    fact.length > 0 &&
    new RegExp(
      `(?<![\\p{L}\\p{N}])${escape(fact).replaceAll(' ', '\\s+')}(?![\\p{L}\\p{N}])`,
      'u',
    ).test(normalized(source))
  );
}
const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
function numericText(value: string): string {
  return normalized(value)
    .replace(/\b([a-z]+)[ -]([a-z]+)\b/gu, (whole, a: string, b: string) =>
      (NUMBER_WORDS[a] ?? 0) >= 20 && (NUMBER_WORDS[b] ?? 0) > 0 && NUMBER_WORDS[b]! < 10
        ? String(NUMBER_WORDS[a]! + NUMBER_WORDS[b]!)
        : whole,
    )
    .replace(/\b[a-z]+\b/gu, (word) =>
      NUMBER_WORDS[word] === undefined ? word : String(NUMBER_WORDS[word]),
    )
    .replace(/(?<=\d),(?=\d{3}(?:\D|$))/gu, '')
    .replace(/\b(?:per cent|percent)\b/gu, '%');
}
/** Digit claims and common English number words; percentages retain their unit. */
export function quantitativeFacts(value: string): string[] {
  return [
    ...numericText(value).matchAll(/(?<![\p{L}\p{N}])\d+(?:\.\d+)?(?:\s*%)?(?![\p{L}\p{N}])/gu),
  ].map((match) => match[0].replace(/\s+/gu, ''));
}
export function supportsQuantities(source: string, value: string): boolean {
  const available = new Set(quantitativeFacts(source));
  return quantitativeFacts(value).every((fact) => available.has(fact));
}
