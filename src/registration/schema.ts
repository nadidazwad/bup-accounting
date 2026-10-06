import { z } from "zod";

export const registrationSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(100),
  email: z.email("Please enter a valid email.").trim().toLowerCase().max(254),
  organisation: z.string().trim().min(1, "Please enter your organisation.").max(150),
  role: z.string().trim().min(1, "Please enter your role.").max(100),
  dietaryRequirements: z.string().trim().max(500).default(""),
  victims: z.coerce.number().int().min(0).max(100000),
  consent: z.literal("on", { error: "Please agree to be contacted about BUPAF." }),
});

export type Registration = z.infer<typeof registrationSchema>;
export type RegistrationField = keyof Registration;
export type RegistrationResult = {
  status: "idle" | "error" | "success";
  message: string;
  errors?: Partial<Record<RegistrationField, string[]>>;
  receiptId?: string;
};

export const initialRegistrationResult: RegistrationResult = { status: "idle", message: "" };
