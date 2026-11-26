import { describe, expect, it } from "vitest";
import { validateBooking, type BookingInput } from "../src/booking-rules";

// "Now" for most tests: Thursday 26 Nov 2026, 11:00 Paris (10:00 UTC, winter).
const NOW = new Date("2026-11-26T10:00:00Z");

function valid(overrides: Partial<BookingInput> = {}): BookingInput {
  return {
    date: "2026-12-04", // Friday
    time: "19:00",
    partySize: 4,
    name: "Marie Dupont",
    phone: "+33 6 12 34 56 78",
    ...overrides,
  };
}

function errorsFor(input: BookingInput, now: Date = NOW, config = {}) {
  const result = validateBooking(input, now, config);
  return result.ok ? [] : result.errors;
}

describe("validateBooking: a good booking", () => {
  it("accepts a complete booking and returns the exact start moment in UTC", () => {
    const result = validateBooking(valid(), NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // 19:00 Paris in December is UTC+1, so 18:00 UTC.
      expect(result.startsAt.toISOString()).toBe("2026-12-04T18:00:00.000Z");
    }
  });

  it("uses a 90 minute sitting for 1 to 4 people", () => {
    const result = validateBooking(valid({ partySize: 4 }), NOW);
    expect(result.ok && result.endsAt.toISOString()).toBe("2026-12-04T19:30:00.000Z");
  });

  it("uses a 120 minute sitting for 5 or more people", () => {
    const result = validateBooking(valid({ partySize: 5 }), NOW);
    expect(result.ok && result.endsAt.toISOString()).toBe("2026-12-04T20:00:00.000Z");
  });

  it("keeps the sitting length when it runs past midnight", () => {
    // Saturday 22:30 Paris (21:30Z), party of 6: ends 00:30 Sunday Paris (23:30Z).
    const result = validateBooking(valid({ date: "2026-12-05", time: "22:30", partySize: 6 }), NOW);
    expect(result.ok && result.startsAt.toISOString()).toBe("2026-12-05T21:30:00.000Z");
    expect(result.ok && result.endsAt.toISOString()).toBe("2026-12-05T23:30:00.000Z");
  });
});

describe("validateBooking: Paris time and daylight saving", () => {
  it("converts summer bookings with UTC+2", () => {
    const now = new Date("2027-06-20T10:00:00Z");
    const result = validateBooking(valid({ date: "2027-07-06", time: "19:00" }), now); // Tuesday
    expect(result.ok && result.startsAt.toISOString()).toBe("2027-07-06T17:00:00.000Z");
  });

  it("handles the Saturday before the March clock change (still UTC+1)", () => {
    const now = new Date("2027-03-01T10:00:00Z");
    const result = validateBooking(valid({ date: "2027-03-27", time: "19:00" }), now);
    expect(result.ok && result.startsAt.toISOString()).toBe("2027-03-27T18:00:00.000Z");
  });

  it("handles the Tuesday after the March clock change (now UTC+2)", () => {
    const now = new Date("2027-03-01T10:00:00Z");
    const result = validateBooking(valid({ date: "2027-03-30", time: "19:00" }), now);
    expect(result.ok && result.startsAt.toISOString()).toBe("2027-03-30T17:00:00.000Z");
  });

  it("handles the Saturday before the October clock change (still UTC+2)", () => {
    const now = new Date("2027-10-15T10:00:00Z");
    const result = validateBooking(valid({ date: "2027-10-30", time: "19:00" }), now);
    expect(result.ok && result.startsAt.toISOString()).toBe("2027-10-30T17:00:00.000Z");
  });

  it("handles the Tuesday after the October clock change (now UTC+1)", () => {
    const now = new Date("2027-10-15T10:00:00Z");
    const result = validateBooking(valid({ date: "2027-11-02", time: "19:00" }), now);
    expect(result.ok && result.startsAt.toISOString()).toBe("2027-11-02T18:00:00.000Z");
  });
});

describe("validateBooking: opening days", () => {
  it.each([
    ["Tuesday", "2026-12-01"],
    ["Friday", "2026-12-04"],
    ["Saturday", "2026-12-05"],
  ])("accepts %s", (_day, date) => {
    expect(validateBooking(valid({ date }), NOW).ok).toBe(true);
  });

  it.each([
    ["Sunday", "2026-12-06"],
    ["Monday", "2026-12-07"],
  ])("refuses %s because the restaurant is closed", (_day, date) => {
    expect(errorsFor(valid({ date }))).toContain("The restaurant is closed on that day");
  });
});

describe("validateBooking: time slots", () => {
  it("accepts the first slot, 12:00", () => {
    expect(validateBooking(valid({ time: "12:00" }), NOW).ok).toBe(true);
  });

  it("accepts the last slot, 22:30", () => {
    expect(validateBooking(valid({ time: "22:30" }), NOW).ok).toBe(true);
  });

  it("refuses 11:30, before opening", () => {
    expect(errorsFor(valid({ time: "11:30" }))).toContain("That time is outside booking hours");
  });

  it("refuses 23:00, after the last slot", () => {
    expect(errorsFor(valid({ time: "23:00" }))).toContain("That time is outside booking hours");
  });

  it("refuses times that are not on the 30 minute grid", () => {
    expect(errorsFor(valid({ time: "19:15" }))).toContain("Bookings start every 30 minutes");
  });

  it("refuses a time that is not a time at all", () => {
    expect(errorsFor(valid({ time: "banana" }))).toContain("Time must look like 19:00");
  });

  it("lets the last slot be changed by a setting", () => {
    expect(errorsFor(valid({ time: "22:00" }), NOW, { lastSlot: "21:30" })).toContain(
      "That time is outside booking hours",
    );
    expect(validateBooking(valid({ time: "21:30" }), NOW, { lastSlot: "21:30" }).ok).toBe(true);
  });
});

describe("validateBooking: party size", () => {
  it.each([1, 12])("accepts %i", (partySize) => {
    expect(validateBooking(valid({ partySize }), NOW).ok).toBe(true);
  });

  it.each([0, -3, 13, 1000, 2.5])("refuses %s", (partySize) => {
    expect(errorsFor(valid({ partySize }))).toContain("Party size must be a whole number from 1 to 12");
  });

  it.each(["4", "banana", null, undefined, NaN])("refuses the non-number %s", (partySize) => {
    expect(errorsFor(valid({ partySize: partySize as unknown as number }))).toContain(
      "Party size must be a whole number from 1 to 12",
    );
  });
});

describe("validateBooking: notice and booking window", () => {
  it("refuses a time that has already passed", () => {
    // Thursday 26 Nov: closed, so use a past open day with a "now" later in the week.
    const now = new Date("2026-12-05T20:00:00Z"); // Saturday 21:00 Paris
    expect(errorsFor(valid({ date: "2026-12-04" }), now)).toContain("That time has already passed");
  });

  it("refuses 29 minutes from now", () => {
    // 19:00 Paris Friday = 18:00Z. "Now" is 18:00Z - 29 min.
    const now = new Date("2026-12-04T17:31:00Z");
    expect(errorsFor(valid(), now)).toContain("Bookings need at least 30 minutes notice");
  });

  it("accepts exactly 30 minutes from now (the boundary)", () => {
    const now = new Date("2026-12-04T17:30:00Z");
    expect(validateBooking(valid(), now).ok).toBe(true);
  });

  it("refuses a booking too far ahead", () => {
    // 2027-03-30 is more than 92 days after 2026-11-26.
    expect(errorsFor(valid({ date: "2027-03-30" }))).toContain("Bookings open up to 3 months ahead");
  });

  it("accepts a booking at the edge of the window", () => {
    // 2027-02-23 (Tuesday) is 89 days after 2026-11-26, comfortably inside.
    expect(validateBooking(valid({ date: "2027-02-23" }), NOW).ok).toBe(true);
  });
});

describe("validateBooking: required fields and bad dates", () => {
  it("refuses a missing name", () => {
    expect(errorsFor(valid({ name: "" }))).toContain("Name is required");
    expect(errorsFor(valid({ name: "   " }))).toContain("Name is required");
  });

  it("refuses a missing phone number", () => {
    expect(errorsFor(valid({ phone: "" }))).toContain("A valid phone number is required");
  });

  it("refuses a phone number with too few digits", () => {
    expect(errorsFor(valid({ phone: "12345" }))).toContain("A valid phone number is required");
  });

  it("refuses a phone number with letters", () => {
    expect(errorsFor(valid({ phone: "call me maybe" }))).toContain("A valid phone number is required");
  });

  it("refuses a very long name", () => {
    expect(errorsFor(valid({ name: "A".repeat(101) }))).toContain("Name is too long");
  });

  it("refuses a date that does not exist", () => {
    expect(errorsFor(valid({ date: "2026-02-30" }))).toContain("Date must look like 2026-12-04");
  });

  it("refuses a date that is not a date", () => {
    expect(errorsFor(valid({ date: "garbage" }))).toContain("Date must look like 2026-12-04");
  });

  it("reports every problem at once, not only the first", () => {
    const errors = errorsFor(valid({ name: "", phone: "", partySize: 0 }));
    expect(errors).toContain("Name is required");
    expect(errors).toContain("A valid phone number is required");
    expect(errors).toContain("Party size must be a whole number from 1 to 12");
  });

  it("refuses input that is not an object at all", () => {
    const result = validateBooking(null as unknown as BookingInput, NOW);
    expect(result.ok).toBe(false);
  });
});
