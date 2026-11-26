import { describe, expect, it } from "vitest";
import request from "supertest";
import { createHandler } from "../src/app";
import { createBooking, DuplicateReferenceError, BookingStore, NewBookingRow } from "../src/bookings";

// Tuesday 1 Dec 2026, 10:00 Paris (09:00 UTC). A valid booking is Friday 4 Dec at 19:30.
const NOW = new Date("2026-12-01T09:00:00Z");
const GOOD = { date: "2026-12-04", time: "19:30", partySize: 4, name: "Test Alice", phone: "+33 1 23 45 67 01" };

function fakeStore(failFirst = 0): BookingStore & { rows: NewBookingRow[]; calls: number } {
  const s = {
    rows: [] as NewBookingRow[],
    calls: 0,
    async insert(row: NewBookingRow) {
      s.calls++;
      if (s.calls <= failFirst) throw new DuplicateReferenceError();
      s.rows.push(row);
    },
  };
  return s;
}

describe("createBooking", () => {
  it("saves a valid booking and returns a reference", async () => {
    const store = fakeStore();
    const r = await createBooking(store, GOOD, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reference).toMatch(/^BK-\d{4}$/);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].startsAt.toISOString()).toBe("2026-12-04T18:30:00.000Z");
    expect(store.rows[0].endsAt.toISOString()).toBe("2026-12-04T20:00:00.000Z");
  });

  it("stores only a hash of the token, never the token", async () => {
    const store = fakeStore();
    await createBooking(store, GOOD, NOW);
    expect(store.rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not touch the store when the rules refuse the booking", async () => {
    const store = fakeStore();
    const r = await createBooking(store, { ...GOOD, partySize: 50 }, NOW);
    expect(r.ok).toBe(false);
    expect(store.calls).toBe(0);
  });

  it("retries with a new reference when one is already taken", async () => {
    const store = fakeStore(2);
    const r = await createBooking(store, GOOD, NOW);
    expect(r.ok).toBe(true);
    expect(store.calls).toBe(3);
  });

  it("gives up after 5 clashes instead of looping forever", async () => {
    await expect(createBooking(fakeStore(99), GOOD, NOW)).rejects.toThrow();
  });

  it("turns dots in the phone into spaces so the table's phone rule accepts it", async () => {
    const store = fakeStore();
    await createBooking(store, { ...GOOD, phone: "01.23.45.67.89" }, NOW);
    expect(store.rows[0].phone).toBe("01 23 45 67 89");
  });

  it("trims the name", async () => {
    const store = fakeStore();
    await createBooking(store, { ...GOOD, name: "  Test Alice  " }, NOW);
    expect(store.rows[0].name).toBe("Test Alice");
  });
});

describe("POST /bookings", () => {
  const app = (store: BookingStore | null) => createHandler({ getStore: () => store, now: () => NOW });

  it("returns 201 with the reference and times, and no token or hash", async () => {
    const store = fakeStore();
    const res = await request(app(store)).post("/bookings").send(GOOD);
    expect(res.status).toBe(201);
    expect(res.body.reference).toMatch(/^BK-\d{4}$/);
    expect(res.body.status).toBe("pending");
    expect(JSON.stringify(res.body)).not.toMatch(/token|hash/i);
  });

  it("returns 400 with every problem listed when the rules refuse", async () => {
    const res = await request(app(fakeStore())).post("/bookings").send({ ...GOOD, partySize: 0, date: "2026-12-06" });
    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBeGreaterThanOrEqual(2);
  });

  it("returns 400 for a body that is not JSON", async () => {
    const res = await request(app(fakeStore())).post("/bookings").set("Content-Type", "application/json").send("{nope");
    expect(res.status).toBe(400);
  });

  it("returns 400 for an empty body", async () => {
    const res = await request(app(fakeStore())).post("/bookings");
    expect(res.status).toBe(400);
  });

  it("returns 413 for an oversized body", async () => {
    const res = await request(app(fakeStore())).post("/bookings").send({ ...GOOD, name: "x".repeat(20000) });
    expect(res.status).toBe(413);
  });

  it("returns 503 when no database is configured (fails closed)", async () => {
    const res = await request(app(null)).post("/bookings").send(GOOD);
    expect(res.status).toBe(503);
  });

  it("returns 500 with no details when the database fails", async () => {
    const broken: BookingStore = { insert: async () => { throw new Error("connect ECONNREFUSED 10.0.0.1 password=secret"); } };
    const res = await request(app(broken)).post("/bookings").send(GOOD);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/secret|ECONNREFUSED/);
  });

  it("returns 404 for GET /bookings (only POST exists)", async () => {
    const res = await request(app(fakeStore())).get("/bookings");
    expect(res.status).toBe(404);
  });
});
