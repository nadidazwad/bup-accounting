import { describe, expect, it, vi } from "vitest";
import { submitRegistration } from "./submit";
import { RateLimiter } from "./rate-limit";

const now = 100000;
function validForm() {
  const form = new FormData();
  Object.entries({ name: "Red Ledger", email: "red@example.com", organisation: "BUP", role: "Student",
    dietaryRequirements: "", victims: "20", consent: "on", website: "", startedAt: "98000" })
    .forEach(([key, value]) => form.set(key, value));
  return form;
}

describe("registration submission", () => {
  it("validates and passes normalized data to the replaceable sink", async () => {
    const sink = { save: vi.fn().mockResolvedValue({ receiptId: "TEST-1" }) };
    const form = validForm();
    form.set("name", " Red Ledger ");
    const result = await submitRegistration(form, sink, now);
    expect(result.status).toBe("success");
    expect(result.message).toContain("has not registered");
    expect(sink.save).toHaveBeenCalledWith(expect.objectContaining({ name: "Red Ledger", victims: 20 }));
  });

  it.each(["email", "consent", "name", "organisation", "role"])("does not save invalid %s", async (field) => {
    const sink = { save: vi.fn() };
    const form = validForm();
    form.set(field, "");
    const result = await submitRegistration(form, sink, now);
    expect(result.status).toBe("error");
    expect(result.errors).toHaveProperty(field);
    expect(sink.save).not.toHaveBeenCalled();
  });

  it.each(["-1", "2.5", "NaN", "100001"])("rejects invalid gameplay counts %s", async (victims) => {
    const sink = { save: vi.fn() };
    const form = validForm();
    form.set("victims", victims);
    expect((await submitRegistration(form, sink, now)).status).toBe("error");
    expect(sink.save).not.toHaveBeenCalled();
  });

  it.each(["0", "bad", "100000", "101000", "1"])("rejects bad or premature timestamps %s", async (startedAt) => {
    const form = validForm();
    form.set("startedAt", startedAt);
    const sink = { save: vi.fn() };
    expect((await submitRegistration(form, sink, startedAt === "1" ? 90000000 : now)).status).toBe("error");
    expect(sink.save).not.toHaveBeenCalled();
  });

  it("rejects honeypots and reports sink failures without false success", async () => {
    const sink = { save: vi.fn().mockRejectedValue(new Error("offline")) };
    const form = validForm();
    form.set("website", "bot");
    expect((await submitRegistration(form, sink, now)).status).toBe("error");
    expect(sink.save).not.toHaveBeenCalled();
    form.set("website", "");
    expect((await submitRegistration(form, sink, now)).message).toContain("not been saved");
  });
});

it("rate limits bursts and expires the window", () => {
  const limiter = new RateLimiter(2, 1000);
  expect(limiter.allow("ip-a", 0)).toBe(true);
  expect(limiter.allow("ip-a", 1)).toBe(true);
  expect(limiter.allow("ip-a", 2)).toBe(false);
  expect(limiter.allow("ip-b", 2)).toBe(true);
  expect(limiter.allow("ip-a", 1000)).toBe(true);
});
