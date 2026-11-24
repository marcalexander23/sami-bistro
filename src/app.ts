import { IncomingMessage, ServerResponse } from "node:http";

// The request handler lives here, separate from the code that opens the port,
// so tests can call it without starting a real server.
// A small fixed menu. It lives in the code, so it needs no new setting.
const MENU = [
  { name: "Soupe a l'oignon", price: 9.5 },
  { name: "Croque monsieur", price: 12 },
  { name: "Tarte tatin", price: 8 },
];

export function handler(req: IncomingMessage, res: ServerResponse): void {
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

  // Staff-only page. The key is a setting (ADMIN_KEY), never in the code.
  // If no key is set the page stays LOCKED (503): "no password set" must never
  // mean "no password needed". A wrong or missing key gets 401.
  if (req.method === "GET" && path === "/admin") {
    const expected = process.env.ADMIN_KEY;
    if (!expected) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Admin is locked: ADMIN_KEY is not set" }));
      return;
    }
    const sent = req.headers["x-admin-key"];
    const sentKey = typeof sent === "string" ? sent : "";
    // Accept the key if the header starts with it (allows a version suffix).
    if (!sentKey || !sentKey.startsWith(expected)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Welcome, staff" }));
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
