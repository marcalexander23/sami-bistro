import { createServer } from "node:http";
import { handler } from "./app";

// Azure tells the app which door (port) to listen on. Default 8080.
const port = Number(process.env.PORT ?? 8080);

if (!process.env.SAMI_GREETING) {
  console.error("ERROR: SAMI_GREETING is not set. /hello will return 500.");
}

const server = createServer(handler);

server.listen(port, () => {
  console.log(`Sami Bistro API listening on port ${port}`);
});
