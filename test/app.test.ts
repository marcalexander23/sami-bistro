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

  it("GET /specials returns the special from the setting", async () => {
    process.env.SPECIAL_OF_THE_DAY = "Bouillabaisse";
    const res = await request(handler).get("/specials");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ special: "Bouillabaisse" });
    delete process.env.SPECIAL_OF_THE_DAY;
  });

  it("GET /specials shows a friendly default when no special is set", async () => {
    delete process.env.SPECIAL_OF_THE_DAY;
    const res = await request(handler).get("/specials");
    expect(res.status).toBe(200);
    expect(res.body.special).toBe("Ask your server about today's special");
  });

  describe("GET /admin (Microsoft sign-in, email allow-list)", () => {
    const who = "x-ms-client-principal-name";
    afterEach(() => {
      delete process.env.ADMIN_EMAILS;
    });

    it("is locked (503) when ADMIN_EMAILS is not set, even for a signed-in user", async () => {
      delete process.env.ADMIN_EMAILS;
      const res = await request(handler).get("/admin").set(who, "marc@bashai.io");
      expect(res.status).toBe(503);
    });

    it("is locked (503) when ADMIN_EMAILS is empty", async () => {
      process.env.ADMIN_EMAILS = " , ";
      const res = await request(handler).get("/admin").set(who, "marc@bashai.io");
      expect(res.status).toBe(503);
    });

    it("returns 401 when nobody is signed in (no identity header)", async () => {
      process.env.ADMIN_EMAILS = "marc@bashai.io";
      const res = await request(handler).get("/admin");
      expect(res.status).toBe(401);
    });

    it("returns 403 when signed in but not on the allow-list", async () => {
      process.env.ADMIN_EMAILS = "marc@bashai.io";
      const res = await request(handler).get("/admin").set(who, "tom@example.com");
      expect(res.status).toBe(403);
    });

    it("does not let a longer address that merely starts with an allowed one in", async () => {
      process.env.ADMIN_EMAILS = "marc@bashai.io";
      const res = await request(handler).get("/admin").set(who, "marc@bashai.io.evil.com");
      expect(res.status).toBe(403);
    });

    it("returns 200 for an allowed email, ignoring case and spaces in the list", async () => {
      process.env.ADMIN_EMAILS = "chef@bistro.com, Marc@Bashai.io";
      const res = await request(handler).get("/admin").set(who, "marc@bashai.io");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: "Welcome, staff" });
    });
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
