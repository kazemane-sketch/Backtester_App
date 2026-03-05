import { getISOWeek, getMonth, getQuarter, getYear, parseISO } from "date-fns";

export function isPeriodEnd(
  date: string,
  nextDate: string | undefined,
  frequency: "weekly" | "monthly" | "quarterly" | "yearly"
) {
  if (!nextDate) {
    return true;
  }

  const current = parseISO(`${date}T00:00:00.000Z`);
  const next = parseISO(`${nextDate}T00:00:00.000Z`);

  if (frequency === "weekly") {
    return getISOWeek(current) !== getISOWeek(next);
  }

  if (frequency === "monthly") {
    return getMonth(current) !== getMonth(next);
  }

  if (frequency === "quarterly") {
    return getQuarter(current) !== getQuarter(next);
  }

  return getYear(current) !== getYear(next);
}
