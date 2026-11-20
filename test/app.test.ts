import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { handler } from "../src/app";

describe("Sami Bistro API", () => {
  beforeEach(() => {
    process.env.SAMI_GREETING = "Hello from Sami Bistro, version 3";
  });

  afterEach(() => {
    delete process.env.SAMI_GREETING;
    delete process.env.APP_ENV;
    delete process.env.APP_VERSION;
  });

  it("GET /hello returns 200 and the exact message", async () => {
    const res = await request(handler).get("/hello");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Hello from Sami Bistro, version 3" });
  });

  it("GET /hello returns 500 when SAMI_GREETING is not set", async () => {
    delete process.env.SAMI_GREETING;
    const res = await request(handler).get("/hello");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "SAMI_GREETING is not set" });
  });

  it("GET /menu returns 200 and a non-empty list of named, priced items", async () => {
    const res = await request(handler).get("/menu");
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const item of res.body.items) {
      expect(typeof item.name).toBe("string");
      expect(item.price).toBeGreaterThan(0);
    }
  });

  it("GET /menu?maxPrice=10 returns only dishes cheaper than 10", async () => {
    const res = await request(handler).get("/menu?maxPrice=10");
    expect(res.status).toBe(200);
    expect(res.body.items.map((d: { name: string }) => d.name)).toEqual([
      "Soupe a l'oignon",
      "Tarte tatin",
    ]);
  });

  it("GET /menu?maxPrice includes a dish priced exactly at the limit", async () => {
    const names = async (q: string) =>
      (await request(handler).get(`/menu?maxPrice=${q}`)).body.items.map(
        (d: { name: string }) => d.name,
      );
    expect(await names("9.5")).toEqual(["Soupe a l'oignon", "Tarte tatin"]);
    expect(await names("12")).toEqual([
      "Soupe a l'oignon",
      "Croque monsieur",
      "Tarte tatin",
    ]);
    expect(await names("8")).toEqual(["Tarte tatin"]);
    expect(await names("5")).toEqual([]);
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
