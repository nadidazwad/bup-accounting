import { registrationSchema, type RegistrationResult } from "./schema";
import type { RegistrationSink } from "./sink";

export async function submitRegistration(
  formData: FormData,
  sink: RegistrationSink,
  now = Date.now(),
): Promise<RegistrationResult> {
  const startedAt = Number(formData.get("startedAt"));
  if (formData.get("website") || !Number.isFinite(startedAt) || startedAt <= 0 ||
      now - startedAt < 1500 || now - startedAt > 24 * 60 * 60 * 1000) {
    return { status: "error", message: "Please take a moment, then try again. Reload the form if it has expired." };
  }

  const parsed = registrationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "It's not very effective... Check the fields below.",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const { receiptId } = await sink.save(parsed.data);
    return {
      status: "success",
      message: "Test save complete. This preview has not registered you for BUPAF.",
      receiptId,
    };
  } catch {
    return { status: "error", message: "The save failed. Your details have not been saved. Please try again." };
  }
}
