import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { handler } from "../src/app";

describe("Sami Bistro API", () => {
  afterEach(() => {
    delete process.env.APP_ENV;
    delete process.env.APP_VERSION;
  });

  it("GET /hello returns 200 and the exact message", async () => {
    const res = await request(handler).get("/hello");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Hello from Sami Bistro, version 2" });
  });

  it("GET /health returns 200 and status ok", async () => {
    const res = await request(handler).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("GET /health reports 'unknown' when the environment variables are not set", async () => {
    const res = await request(handler).get("/health");
    expect(res.body.environment).toBe("unknown");
    expect(res.body.version).toBe("unknown");
  });

  it("GET /health reports the environment and version it was given", async () => {
    process.env.APP_ENV = "staging";
    process.env.APP_VERSION = "3f9c2ab";
    const res = await request(handler).get("/health");
    expect(res.body).toEqual({ status: "ok", environment: "staging", version: "3f9c2ab" });
  });

  it("an unknown address returns 404", async () => {
    const res = await request(handler).get("/nothing-here");
    expect(res.status).toBe(404);
  });
});
