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

  // Staff-only page. Azure signs the visitor in and puts their email in the
  // x-ms-client-principal-name header. That header is only trustworthy if Azure
  // blocks anonymous visitors on this path first (see the deploy notes).
  // ADMIN_EMAILS is the allow-list. If it is empty or missing the page stays
  // LOCKED (503): "no list" must never mean "everyone".
  if (req.method === "GET" && path === "/admin") {
    const allowed = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0);
    if (allowed.length === 0) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Admin is locked: ADMIN_EMAILS is not set" }));
      return;
    }
    const header = req.headers["x-ms-client-principal-name"];
    const who = typeof header === "string" ? header.trim().toLowerCase() : "";
    if (!who) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Sign in required" }));
      return;
    }
    // Exact match against the list, never "starts with".
    if (!allowed.includes(who)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not allowed" }));
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
