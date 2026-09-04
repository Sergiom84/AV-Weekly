/**
 * ISO week arithmetic, shared by the parsers that group dated rows into weeks.
 *
 * It lives on its own because two modules now need the same answer from the
 * same rule: Informática derives the week of a work order, and Oficinas derives
 * the week an IMAC request was closed. A second copy of this calculation is the
 * kind of thing that agrees for a year and then disagrees on a 31 December.
 *
 * Both functions resolve the week through the Thursday of that week, which is
 * what makes 29 December and 2 January land in the same week when they belong
 * to the same one.
 */

const DAY = 86_400_000;

/** Monday-based index of a UTC date, 0 for Monday. */
function dayIndex(date: Date): number {
  return (date.getUTCDay() + 6) % 7;
}

/** Thursday of the ISO week a UTC date belongs to. */
function thursdayOf(date: Date): Date {
  return new Date(date.getTime() + (3 - dayIndex(date)) * DAY);
}

/** ISO week number of a UTC date, 1 to 53. */
export function isoWeek(date: Date): number {
  const thursday = thursdayOf(date);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const firstWeekThursday = thursdayOf(firstThursday);

  return 1 + Math.round((thursday.getTime() - firstWeekThursday.getTime()) / (7 * DAY));
}

/**
 * ISO week-year of a UTC date: the year of the Thursday of its week.
 *
 * Needed wherever weeks are grouped, because weeks 1 and 53 straddle the
 * calendar year and `getUTCFullYear()` would split one week across two years.
 */
export function isoWeekYear(date: Date): number {
  return thursdayOf(date).getUTCFullYear();
}

/** Thursday of an ISO week, used to map a report week onto a calendar month. */
export function isoWeekThursday(year: number, week: number): Date {
  const firstThursday = thursdayOf(new Date(Date.UTC(year, 0, 4)));

  return new Date(firstThursday.getTime() + (week - 1) * 7 * DAY);
}
