import { Pool } from "pg";
import { BookingStore, DuplicateReferenceError, NewBookingRow } from "./bookings";

let pool: Pool | null = null;

// The connection string comes from the DATABASE_URL secret. If it is missing
// we return null, and the caller refuses the request (fails closed).
export function getBookingStore(): BookingStore | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!pool) {
    pool = new Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 10000 });
    // An idle connection dropping must not crash the whole app.
    pool.on("error", (err) => console.error("Database pool error:", err.message));
  }
  const p = pool;
  return {
    async insert(row: NewBookingRow): Promise<void> {
      try {
        // Values go in as $1, $2... parameters, never glued into the SQL text.
        await p.query(
          `INSERT INTO bookings (reference, token_hash, name, phone, party_size, starts_at, ends_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [row.reference, row.tokenHash, row.name, row.phone, row.partySize, row.startsAt, row.endsAt],
        );
      } catch (err) {
        // 23505 is Postgres's code for "unique rule broken".
        if ((err as { code?: string }).code === "23505") throw new DuplicateReferenceError();
        throw err;
      }
    },
  };
}
