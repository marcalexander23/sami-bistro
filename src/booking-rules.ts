// Booking rules. Pure functions only: no database, no clock, no environment.
// Callers pass "now" in, so every rule is testable at any moment, including
// the days the clocks change.

export interface BookingInput {
  date: string; // local Paris date, e.g. "2026-12-04"
  time: string; // local Paris time, e.g. "19:00"
  partySize: number;
  name: string;
  phone: string;
}

export interface BookingConfig {
  openDays: number[]; // 0 = Sunday ... 6 = Saturday, in Paris
  firstSlot: string;
  lastSlot: string;
  slotMinutes: number;
  minNoticeMinutes: number;
  maxDaysAhead: number;
  minParty: number;
  maxParty: number;
  shortSittingMinutes: number; // for parties up to shortSittingMaxParty
  longSittingMinutes: number;
  shortSittingMaxParty: number;
}

export const DEFAULT_CONFIG: BookingConfig = {
  openDays: [2, 3, 4, 5, 6], // Tuesday to Saturday
  firstSlot: "12:00",
  lastSlot: "22:30",
  slotMinutes: 30,
  minNoticeMinutes: 30,
  maxDaysAhead: 92, // about 3 months
  minParty: 1,
  maxParty: 12,
  shortSittingMinutes: 90,
  longSittingMinutes: 120,
  shortSittingMaxParty: 4,
};

export type BookingResult =
  | { ok: true; startsAt: Date; endsAt: Date }
  | { ok: false; errors: string[] };

const TIME_ZONE = "Europe/Paris";

const parisFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

// How many minutes Paris is ahead of UTC at a given instant (60 or 120).
function parisOffsetMinutes(instant: number): number {
  const parts: Record<string, number> = {};
  for (const part of parisFormat.formatToParts(new Date(instant))) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  const asIfUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((asIfUtc - instant) / 60000);
}

// Turns a Paris wall-clock date and time into the exact moment it means.
// Returns null when that wall-clock time does not exist in Paris.
function parisToInstant(year: number, month: number, day: number, hour: number, minute: number): Date | null {
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let instant = wanted - parisOffsetMinutes(wanted) * 60000;
  instant = wanted - parisOffsetMinutes(instant) * 60000;
  // Round trip: if Paris does not show the time we asked for, it never happened
  // (the hour skipped when the clocks go forward).
  const back = instant + parisOffsetMinutes(instant) * 60000;
  return back === wanted ? new Date(instant) : null;
}

function parseDate(value: unknown): { year: number; month: number; day: number } | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

function parseTime(value: unknown): { hour: number; minute: number } | null {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function toMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function validPhone(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!/^\+?[0-9 ().-]+$/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, "").length;
  return digits >= 8 && digits <= 15;
}

export function sittingMinutes(partySize: number, config: BookingConfig = DEFAULT_CONFIG): number {
  return partySize <= config.shortSittingMaxParty ? config.shortSittingMinutes : config.longSittingMinutes;
}

export function validateBooking(
  input: BookingInput,
  now: Date,
  overrides: Partial<BookingConfig> = {},
): BookingResult {
  if (input === null || typeof input !== "object") {
    return { ok: false, errors: ["Booking details are required"] };
  }
  const config: BookingConfig = { ...DEFAULT_CONFIG, ...overrides };
  const errors: string[] = [];

  // Who.
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length === 0) errors.push("Name is required");
  else if (name.length > 100) errors.push("Name is too long");
  if (!validPhone(input.phone)) errors.push("A valid phone number is required");

  // How many.
  const size = input.partySize;
  const sizeOk = typeof size === "number" && Number.isInteger(size) && size >= config.minParty && size <= config.maxParty;
  if (!sizeOk) {
    errors.push(`Party size must be a whole number from ${config.minParty} to ${config.maxParty}`);
  }

  // When: shape first, then the rules that need a real date and time.
  const date = parseDate(input.date);
  const time = parseTime(input.time);
  if (!date) errors.push("Date must look like 2026-12-04");
  if (!time) errors.push("Time must look like 19:00");

  let startsAt: Date | null = null;
  if (date) {
    const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day, 12)).getUTCDay();
    if (!config.openDays.includes(weekday)) errors.push("The restaurant is closed on that day");
  }
  if (time) {
    const minutes = time.hour * 60 + time.minute;
    if (minutes % config.slotMinutes !== 0) {
      errors.push(`Bookings start every ${config.slotMinutes} minutes`);
    } else if (minutes < toMinutes(config.firstSlot) || minutes > toMinutes(config.lastSlot)) {
      errors.push("That time is outside booking hours");
    }
  }
  if (date && time) {
    startsAt = parisToInstant(date.year, date.month, date.day, time.hour, time.minute);
    if (startsAt === null) {
      errors.push("That time does not exist on that date");
    } else {
      const nowMs = now.getTime();
      const startMs = startsAt.getTime();
      if (startMs < nowMs) {
        errors.push("That time has already passed");
      } else if (startMs < nowMs + config.minNoticeMinutes * 60000) {
        errors.push(`Bookings need at least ${config.minNoticeMinutes} minutes notice`);
      } else if (startMs > nowMs + config.maxDaysAhead * 86400000) {
        errors.push("Bookings open up to 3 months ahead");
      }
    }
  }

  if (errors.length > 0 || startsAt === null) return { ok: false, errors };
  const endsAt = new Date(startsAt.getTime() + sittingMinutes(size, config) * 60000);
  return { ok: true, startsAt, endsAt };
}
