import { createServer } from "node:http";

// Azure tells the app which door (port) to listen on. Default 8080.
const port = Number(process.env.PORT ?? 8080);

const server = createServer((req, res) => {
  const path = (req.url ?? "/").split("?")[0];

  if (req.method === "GET" && path === "/hello") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Hello from Sami Bistro, version 2" }));
    return;
  }

  // Azure uses this to check the app is alive.
  if (req.method === "GET" && path === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(port, () => {
  console.log(`Sami Bistro API listening on port ${port}`);
});
