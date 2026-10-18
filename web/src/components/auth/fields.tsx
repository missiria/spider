"use client";

import { AlertCircle, Clock, Loader2 } from "lucide-react";
import { useId } from "react";

export function TextField({
  label,
  optional = false,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  optional?: boolean;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {optional && (
          <span className="ml-1.5 font-normal text-muted">optional</span>
        )}
      </label>
      <input
        id={id}
        required={!optional}
        {...props}
        className="auth-input mt-1.5 block w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] outline-none transition-colors focus:border-primary focus:ring-3 focus:ring-primary/15"
      />
    </div>
  );
}

export function SubmitButton({
  busy,
  children,
  busyLabel,
}: {
  busy: boolean;
  children: React.ReactNode;
  busyLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="relative inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[15px] font-medium text-white transition-[background-color,transform] hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.99] disabled:cursor-wait disabled:opacity-80"
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {busy ? busyLabel : children}
    </button>
  );
}

/** Inline message under a form. `error` shakes once each time `nonce` changes. */
export function FormNotice({
  tone,
  message,
  nonce,
}: {
  tone: "error" | "pending";
  message: string;
  nonce?: number;
}) {
  const Icon = tone === "error" ? AlertCircle : Clock;
  return (
    <div
      key={nonce}
      role={tone === "error" ? "alert" : "status"}
      className={`flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${
        tone === "error"
          ? "auth-shake border-danger/30 bg-danger-soft text-danger"
          : "auth-swap border-warning/30 bg-warning-soft text-warning"
      }`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

/** Success / next-step panel shown in place of a form once it has done its job. */
export function DoneState({
  icon,
  title,
  children,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <div className="auth-swap">
      <div className="grid h-11 w-11 place-items-center rounded-full bg-primary-soft text-primary">
        {icon}
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-2 text-[15px] leading-relaxed text-muted">
        {children}
      </div>
      <div className="mt-8">{action}</div>
    </div>
  );
}
