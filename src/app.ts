import { IncomingMessage, ServerResponse } from "node:http";

// The request handler lives here, separate from the code that opens the port,
// so tests can call it without starting a real server.
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
