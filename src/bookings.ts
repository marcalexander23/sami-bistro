import { createHash, randomBytes, randomInt } from "node:crypto";
import { BookingInput, validateBooking } from "./booking-rules";

// One row to save. The database fills in id, status and created_at itself.
export interface NewBookingRow {
  reference: string;
  tokenHash: string;
  name: string;
  phone: string;
  partySize: number;
  startsAt: Date;
  endsAt: Date;
}

// The only thing the booking code needs from a database. Tests pass a fake.
export interface BookingStore {
  insert(row: NewBookingRow): Promise<void>;
}

// Thrown by a store when the reference is already used (the UNIQUE rule fired).
export class DuplicateReferenceError extends Error {
  constructor() {
    super("Booking reference already exists");
  }
}

export type CreateResult =
  | { ok: true; reference: string; startsAt: Date; endsAt: Date }
  | { ok: false; errors: string[] };

const MAX_ATTEMPTS = 5;

export async function createBooking(
  store: BookingStore,
  input: BookingInput,
  now: Date,
): Promise<CreateResult> {
  const checked = validateBooking(input, now);
  if (!checked.ok) return checked;

  // The rules accept dots in a phone number; the table's phone rule does not.
  const phone = input.phone.trim().replace(/\./g, " ");
  const name = input.name.trim();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const reference = `BK-${String(randomInt(0, 10000)).padStart(4, "0")}`;
    // The private-link token is for the text-message slice, which is not built
    // yet. We store only its hash and do not return the token.
    const token = randomBytes(24).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    try {
      await store.insert({
        reference,
        tokenHash,
        name,
        phone,
        partySize: input.partySize,
        startsAt: checked.startsAt,
        endsAt: checked.endsAt,
      });
      return { ok: true, reference, startsAt: checked.startsAt, endsAt: checked.endsAt };
    } catch (err) {
      if (err instanceof DuplicateReferenceError) continue; // try a new reference
      throw err;
    }
  }
  throw new Error("Could not find a free booking reference");
}
