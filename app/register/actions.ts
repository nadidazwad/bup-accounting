"use server";

import { headers } from "next/headers";
import { RateLimiter } from "@/src/registration/rate-limit";
import { registrationSink } from "@/src/registration/sink";
import { submitRegistration } from "@/src/registration/submit";
import type { RegistrationResult } from "@/src/registration/schema";

// Local, single-process protection for M1. A production sink needs a shared limiter.
const limiter = new RateLimiter();

export async function registerForBupaf(
  previous: RegistrationResult,
  formData: FormData,
): Promise<RegistrationResult> {
  void previous;
  // Fail closed in production until M8 supplies a real persistence destination.
  if (process.env.NODE_ENV === "production") {
    return { status: "error", message: "Registration is not open yet. Please check back when BUPAF registration launches." };
  }
  const requestHeaders = await headers();
  // Only use an IP header when explicitly configured behind a trusted proxy.
  const ip = process.env.TRUST_PROXY === "1"
    ? requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"
    : "local";
  if (!limiter.allow(ip)) {
    return { status: "error", message: "Too many save attempts. Please wait a minute before trying again." };
  }
  return submitRegistration(formData, registrationSink);
}
