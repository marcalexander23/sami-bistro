import { IncomingMessage, ServerResponse } from "node:http";
import { BookingStore, createBooking } from "./bookings";
import { getBookingStore } from "./db";

// The request handler lives here, separate from the code that opens the port,
// so tests can call it without starting a real server.
// A small fixed menu. It lives in the code, so it needs no new setting.
const MENU = [
  { name: "Soupe a l'oignon", price: 9.5 },
  { name: "Croque monsieur", price: 12 },
  { name: "Tarte tatin", price: 8 },
];

export interface Deps {
  getStore: () => BookingStore | null;
  now: () => Date;
}

const MAX_BODY_BYTES = 10_000;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// Reads the request body, refusing anything over MAX_BODY_BYTES.
function readBody(req: IncomingMessage): Promise<string | "too-large"> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    let tooLarge = false;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) tooLarge = true;
      else chunks.push(chunk);
    });
    req.on("end", () => resolve(tooLarge ? "too-large" : Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function postBooking(req: IncomingMessage, res: ServerResponse, deps: Deps): Promise<void> {
  const store = deps.getStore();
  if (!store) {
    sendJson(res, 503, { error: "Bookings are not available right now" });
    return;
  }
  const raw = await readBody(req);
  if (raw === "too-large") {
    sendJson(res, 413, { error: "Request body is too large" });
    return;
  }
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    sendJson(res, 400, { errors: ["Body must be valid JSON"] });
    return;
  }
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    sendJson(res, 400, { errors: ["Body must be a JSON object"] });
    return;
  }
  try {
    const result = await createBooking(store, input as never, deps.now());
    if (!result.ok) {
      sendJson(res, 400, { errors: result.errors });
      return;
    }
    sendJson(res, 201, {
      reference: result.reference,
      status: "pending",
      startsAt: result.startsAt.toISOString(),
      endsAt: result.endsAt.toISOString(),
    });
  } catch (err) {
    // Log the cause for us; tell the customer nothing about the inside.
    console.error("Booking failed:", err instanceof Error ? err.message : "unknown error");
    sendJson(res, 500, { error: "Something went wrong. Please try again." });
  }
}

export function createHandler(deps: Deps) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    if (req.method === "POST" && (req.url ?? "/").split("?")[0] === "/bookings") {
      postBooking(req, res, deps).catch(() => {
        if (!res.headersSent) sendJson(res, 500, { error: "Something went wrong. Please try again." });
      });
      return;
    }
    handle(req, res);
  };
}

export const handler = createHandler({ getStore: getBookingStore, now: () => new Date() });

function handle(req: IncomingMessage, res: ServerResponse): void {
  const path = (req.url ?? "/").split("?")[0];

  if (req.method === "GET" && path === "/hello") {
    // The greeting is a setting, not hard-coded. If nobody set it, say so
    // loudly instead of guessing.
    const greeting = process.env.SAMI_GREETING;
    if (!greeting) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "SAMI_GREETING is not set" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: greeting }));
    return;
  }

  if (req.method === "GET" && path === "/menu") {
    // Optional filter: /menu?maxPrice=10 lists dishes up to that price.
    const maxPrice = new URL(req.url ?? "/", "http://localhost").searchParams.get("maxPrice");
    const items = maxPrice === null ? MENU : MENU.filter((d) => d.price <= Number(maxPrice));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ items }));
    return;
  }

  // Today's special comes from a setting, so the kitchen can change it without
  // a new release. If nobody set it, show a friendly default.
  if (req.method === "GET" && path === "/specials") {
    const special =
      process.env.SPECIAL_OF_THE_DAY ?? "Ask your server about today's special";
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ special }));
    return;
  }

  // "Are you alive, and which build are you?" APP_ENV and APP_VERSION are
  // set on the container; "unknown" means nobody set them.
  if (req.method === "GET" && path === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        environment: process.env.APP_ENV ?? "unknown",
        version: process.env.APP_VERSION ?? "unknown",
      }),
    );
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}
