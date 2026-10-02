import { startOfYear, endOfYear, addDays, endOfDay, format, isWithinInterval, getDay } from 'date-fns';

export interface WeekCode {
  code: string;
  startDate: Date;
  endDate: Date;
  label: string;
}

export function generateWeekCodesForYear(year: number): WeekCode[] {
  const weekCodes: WeekCode[] = [];
  const yearStart = startOfYear(new Date(year, 0, 1));
  const yearEnd = endOfYear(new Date(year, 11, 31));

  // Find the Monday of the week containing January 1st
  // getDay: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const dayOfWeek = getDay(yearStart);
  // If January 1st is not Monday (1), go back to the previous Monday
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  let currentDate = addDays(yearStart, -daysToSubtract);

  let weekNumber = 1;

  while (currentDate <= yearEnd) {
    const weekStart = currentDate;
    // End of Sunday (23:59:59.999), not Sunday midnight — otherwise any time
    // after 00:00 on Sunday falls past the week's end and matches no week,
    // silently defaulting the new-ad form to week 1.
    const weekEnd = endOfDay(addDays(currentDate, 6)); // Monday + 6 days = Sunday

    const code = `Y${year % 100}W${String(weekNumber).padStart(2, '0')}`;
    const label = `${format(weekStart, 'MM.dd.yyyy')} – ${format(weekEnd, 'MM.dd.yyyy')} (${code})`;

    weekCodes.push({
      code,
      startDate: weekStart,
      endDate: weekEnd,
      label,
    });

    currentDate = addDays(currentDate, 7);
    weekNumber++;
  }

  return weekCodes;
}

export function getCurrentAndNextYearWeekCodes(): WeekCode[] {
  const now = new Date();
  const currentYear = now.getFullYear();

  // Return all weeks of the current year starting from January
  return generateWeekCodesForYear(currentYear);
}

export function getWeekCodeForDate(date: Date): string | null {
  const year = date.getFullYear();
  const weekCodes = generateWeekCodesForYear(year);

  const match = weekCodes.find((week) =>
    isWithinInterval(date, { start: week.startDate, end: week.endDate })
  );

  return match?.code || null;
}
