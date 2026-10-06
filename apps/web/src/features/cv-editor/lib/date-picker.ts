import { MIN_CV_YEAR, MONTHS, maxEducationYear, type CvDate } from "./dates";

// Rules of the month / year picker (Figma 06.3, 06.5), kept pure so they are tested without a DOM.
// A picker writes the same text the draft already holds: "Jun 2025" for a month, "2025" for a year.

export const YEARS_PER_PAGE = 12;

const LONG_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** The first and last date a picker may choose, both inclusive; a null month means the whole year. */
export interface DateBounds {
  min: CvDate;
  max: CvDate;
}

/**
 * Bounds of a CV date. A date in the past or today (a start date, the end of a job) stops at the
 * current month; education may end up to ten years ahead (expected graduation). `after` is the date
 * the range starts on, so an end can never be picked before its start.
 */
export function dateBounds({
  future,
  after = null,
  today = new Date(),
}: {
  future: boolean;
  after?: CvDate | null;
  today?: Date;
}): DateBounds {
  const max: CvDate = future
    ? { year: maxEducationYear(today), month: null }
    : { year: today.getFullYear(), month: today.getMonth() + 1 };
  const min: CvDate = after ?? { year: MIN_CV_YEAR, month: null };
  return { min: min.year < MIN_CV_YEAR ? { year: MIN_CV_YEAR, month: null } : min, max };
}

export function monthDisabled(year: number, month: number, { min, max }: DateBounds): boolean {
  if (year < min.year || year > max.year) return true;
  if (year === min.year && min.month !== null && month < min.month) return true;
  return year === max.year && max.month !== null && month > max.month;
}

export function yearDisabled(year: number, { min, max }: DateBounds): boolean {
  return year < min.year || year > max.year;
}

/** The text a picker stores: "Jun 2025", or just "2025" when no month is chosen. */
export function formatPicked({ year, month }: CvDate): string {
  return month === null ? String(year) : `${MONTHS[month - 1]} ${year}`;
}

/** The text of the "Selected" row: "June 2025", or "2025". */
export function selectedLabel({ year, month }: CvDate): string {
  return month === null ? String(year) : `${LONG_MONTHS[month - 1]} ${year}`;
}

/** The year the picker opens on: the value's own, or this year kept inside the bounds. */
export function initialYear(value: CvDate | null, bounds: DateBounds, today: Date = new Date()): number {
  const year = value?.year ?? today.getFullYear();
  return Math.min(bounds.max.year, Math.max(bounds.min.year, year));
}

/** The first year of the 12-year page holding `year`; the newest page ends on the latest allowed year. */
export function yearPageStart(year: number, { max }: DateBounds): number {
  const pagesBack = Math.max(0, Math.floor((max.year - year) / YEARS_PER_PAGE));
  return max.year - (YEARS_PER_PAGE - 1) - pagesBack * YEARS_PER_PAGE;
}

export const yearsOnPage = (start: number): number[] =>
  Array.from({ length: YEARS_PER_PAGE }, (_, index) => start + index);

export const canPageBack = (start: number, { min }: DateBounds): boolean => start > min.year;
export const canPageForward = (start: number, { max }: DateBounds): boolean => start + YEARS_PER_PAGE - 1 < max.year;

/**
 * The choice after the year changes: the month stays when the new year allows it, otherwise it
 * clears, so the picker never keeps a date it could not have offered.
 */
export function withYear(selected: CvDate | null, year: number, bounds: DateBounds): CvDate {
  const month = selected?.month ?? null;
  return { year, month: month !== null && !monthDisabled(year, month, bounds) ? month : null };
}
