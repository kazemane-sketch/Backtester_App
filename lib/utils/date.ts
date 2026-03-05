import { parseISO, formatISO } from "date-fns";

export function toISODate(date: Date | string): string {
  if (typeof date === "string") {
    return date.slice(0, 10);
  }

  return formatISO(date, { representation: "date" });
}

export function isoDateToEpochMs(date: string): number {
  return parseISO(`${date}T00:00:00.000Z`).getTime();
}

export function yearsBetween(startDate: string, endDate: string): number {
  const start = isoDateToEpochMs(startDate);
  const end = isoDateToEpochMs(endDate);
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  return (end - start) / msPerYear;
}
