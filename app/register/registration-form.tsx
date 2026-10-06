"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { registerForBupaf } from "./actions";
import { initialRegistrationResult, type RegistrationField } from "@/src/registration/schema";

type Props = { playerName: string; victims: number; startedAt: number; onPlayAgain: () => void };

export default function RegistrationForm({ playerName, victims, startedAt, onPlayAgain }: Props) {
  const [result, action, pending] = useActionState(registerForBupaf, initialRegistrationResult);
  const [values, setValues] = useState({ name: playerName === "RED" ? "" : playerName,
    email: "", organisation: "", role: "", dietaryRequirements: "", consent: false });
  const change = (field: "name" | "email" | "organisation" | "role" | "dietaryRequirements", value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }));
  };
  const title = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { title.current?.focus(); }, []);
  useEffect(() => {
    if (result.status === "error") {
      form.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
    }
    if (result.status === "success") title.current?.focus();
  }, [result]);

  const error = (field: RegistrationField) => result.errors?.[field]?.[0];
  const fieldProps = (field: RegistrationField) => ({
    "aria-invalid": error(field) ? true as const : undefined,
    "aria-describedby": error(field) ? `${field}-error` : undefined,
  });
  const errorLine = (field: RegistrationField) => error(field) && <span className="field-error" id={`${field}-error`}>{error(field)}</span>;

  if (result.status === "success") {
    return (
      <section className="registration-panel" aria-labelledby="registration-title" id="registration">
        <p className="form-kicker">Game saved</p>
        <h2 id="registration-title" ref={title} tabIndex={-1}>Test save complete.</h2>
        <p role="status">{result.message}</p>
        <p className="receipt">Receipt: {result.receiptId}</p>
        <button className="primary-button" onClick={onPlayAgain}>Play again</button>
      </section>
    );
  }

  return (
    <section className="registration-panel" aria-labelledby="registration-title" id="registration">
      <p className="form-kicker">The hardest level starts now</p>
      <h2 id="registration-title" ref={title} tabIndex={-1}>Register for BUPAF.</h2>
      <p className="preview-note">Test form. Registration opens once the event details and destination are connected.</p>
      {/* React resets forms after resolved actions, including returned validation errors.
          Keep controlled fields intact; the success view removes this form. */}
      <form action={action} ref={form} onReset={(event) => event.preventDefault()}>
        <div className="form-grid">
          <div className="form-field"><label htmlFor="name">Name
            <input id="name" name="name" autoComplete="name" value={values.name} onChange={(event) => change("name", event.currentTarget.value)} required minLength={2} maxLength={100} {...fieldProps("name")} />
          </label>{errorLine("name")}</div>
          <div className="form-field"><label htmlFor="email">Email
            <input id="email" name="email" type="email" autoComplete="email" value={values.email} onChange={(event) => change("email", event.currentTarget.value)} required maxLength={254} {...fieldProps("email")} />
          </label>{errorLine("email")}</div>
          <div className="form-field"><label htmlFor="organisation">Company / organisation
            <input id="organisation" name="organisation" autoComplete="organization" value={values.organisation} onChange={(event) => change("organisation", event.currentTarget.value)} required maxLength={150} {...fieldProps("organisation")} />
          </label>{errorLine("organisation")}</div>
          <div className="form-field"><label htmlFor="role">Role
            <input id="role" name="role" autoComplete="organization-title" value={values.role} onChange={(event) => change("role", event.currentTarget.value)} required maxLength={100} {...fieldProps("role")} />
          </label>{errorLine("role")}</div>
          <div className="form-field full-width"><label htmlFor="dietaryRequirements">Dietary requirements <span className="optional">Optional</span>
            <input id="dietaryRequirements" name="dietaryRequirements" value={values.dietaryRequirements} onChange={(event) => change("dietaryRequirements", event.currentTarget.value)} maxLength={500} {...fieldProps("dietaryRequirements")} />
          </label>{errorLine("dietaryRequirements")}</div>
          <div className="form-field full-width"><label htmlFor="victims">How many pedestrians did you run over?
            <input id="victims" name="victims" type="number" value={victims} readOnly {...fieldProps("victims")} />
          </label>{errorLine("victims")}</div>
        </div>
        <label className="consent" htmlFor="consent">
          <input id="consent" name="consent" type="checkbox" checked={values.consent} onChange={(event) => { const consent = event.currentTarget.checked; setValues((previous) => ({ ...previous, consent })); }} required {...fieldProps("consent")} />
          <span>I agree to the BUPAF team using these details to contact me about the event.</span>
        </label>
        {errorLine("consent")}
        <div className="honeypot" aria-hidden="true">
          <label htmlFor="website">Leave this field empty</label>
          <input id="website" name="website" tabIndex={-1} autoComplete="off" />
        </div>
        <input type="hidden" name="startedAt" value={startedAt} />
        <p className="form-status" role="status" aria-live="polite">{pending ? "SAVING... DON'T TURN OFF THE POWER." : result.message}</p>
        <div className="form-actions">
          <button className="primary-button" type="submit" disabled={pending}>{pending ? "Saving..." : "Save the game? YES"}</button>
          <button className="text-button" type="button" onClick={onPlayAgain} disabled={pending}>Back to the game</button>
        </div>
      </form>
    </section>
  );
}
