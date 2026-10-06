import { randomUUID } from "node:crypto";
import type { Registration } from "./schema";

export interface RegistrationSink {
  save(registration: Registration): Promise<{ receiptId: string }>;
}

// M1 uses an intentionally transient sink. It stores no personal data or logs.
// M8 must replace this with the team's chosen destination before launch.
export class StubRegistrationSink implements RegistrationSink {
  async save(registration: Registration) {
    void registration;
    return { receiptId: `TEST-${randomUUID()}` };
  }
}

export const registrationSink: RegistrationSink = new StubRegistrationSink();
