/** Month precision stays optional: a source containing only a year never gains an invented month. */
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const LONG_MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const UK_MONTHS = ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"];
export const MIN_CV_YEAR = 1900;
export const maxEducationYear = (today: Date = new Date()): number => today.getFullYear() + 10;

export interface CvDate {
  year: number;
  month: number | null;
}

export function parseCvDate(value: string): CvDate | null {
  const text = value.trim();
  if (/^\d{4}$/.test(text)) return { year: Number(text), month: null };
  const numeric = /^(\d{4})-(\d{2})$/.exec(text);
  const reversed = /^(\d{1,2})[/.](\d{4})$/.exec(text);
  if (numeric || reversed) {
    const year = Number(numeric ? numeric[1] : reversed?.[2]);
    const month = Number(numeric ? numeric[2] : reversed?.[1]);
    return month >= 1 && month <= 12 ? { year, month } : null;
  }
  const named = /^([\p{L}.]+)\s+(\d{4})$/u.exec(text);
  if (!named) return null;
  const token = named[1].replace(/\.$/, "").toLowerCase();
  const month = MONTHS.findIndex((name, index) => token === name.toLowerCase() || token === LONG_MONTHS[index] || (token.length >= 3 && token.startsWith(UK_MONTHS[index]))) + 1;
  return month > 0 ? { year: Number(named[2]), month } : null;
}

/** Never infer January/December when checking a range that only specifies years. */
export function reversedDateRange(start: CvDate, end: CvDate): boolean {
  return start.year > end.year || (start.year === end.year && start.month !== null && end.month !== null && start.month > end.month);
}

export function dateError(value: string, futureAllowed: boolean, today: Date = new Date()): string | null {
  if (value.trim() === "") return null;
  const date = parseCvDate(value);
  if (!date) return "Use a four-digit year, with an optional month.";
  const max = futureAllowed ? maxEducationYear(today) : today.getFullYear();
  if (date.year < MIN_CV_YEAR || date.year > max) return `Use a year between ${MIN_CV_YEAR} and ${max}.`;
  if (!futureAllowed && date.year === today.getFullYear() && date.month !== null && date.month > today.getMonth() + 1) return "This date cannot be in the future.";
  return null;
}

/** Elapsed whole calendar months. Year-only ranges have no reliable monthly duration. */
export function experienceDuration(startValue: string, endValue: string, today: Date = new Date()): string | null {
  const start = parseCvDate(startValue);
  const end = endValue.trim().toLowerCase() === "present"
    ? { year: today.getFullYear(), month: today.getMonth() + 1 }
    : parseCvDate(endValue);
  if (!start || !end || start.month === null || end.month === null || dateError(startValue, false, today) || (endValue.trim().toLowerCase() !== "present" && dateError(endValue, false, today))) return null;
  const months = (end.year - start.year) * 12 + end.month - start.month;
  if (months < 0) return null;
  if (months === 0) return "Less than a month";
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  return [years > 0 ? `${years} ${years === 1 ? "year" : "years"}` : "", remainder > 0 ? `${remainder} ${remainder === 1 ? "month" : "months"}` : ""].filter(Boolean).join(" ");
}
