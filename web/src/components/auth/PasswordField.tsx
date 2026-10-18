"use client";

import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { useEffect, useId, useState } from "react";

/** Score 0-4 against the API rule (10+ chars, a letter and a digit) plus two bonuses. */
export function passwordScore(v: string): number {
  if (!v) return 0;
  let s = 0;
  if (v.length >= 10) s++;
  if (/[A-Za-z]/.test(v) && /\d/.test(v)) s++;
  if (/[a-z]/.test(v) && /[A-Z]/.test(v)) s++;
  if (/[^A-Za-z0-9]/.test(v) || v.length >= 16) s++;
  return s;
}

export const meetsPasswordRule = (v: string) =>
  /^(?=.*[A-Za-z])(?=.*\d).{10,72}$/.test(v);

const STRENGTH = ["Too short", "Weak", "Fair", "Good", "Strong"];

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  showStrength = false,
  aside,
  invalid = false,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  showStrength?: boolean;
  /** rendered on the label row, right-aligned (e.g. "Forgot password?") */
  aside?: React.ReactNode;
  invalid?: boolean;
  hint?: string;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const score = passwordScore(value);
  const iconBtn =
    "grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-40";

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {aside}
      </div>
      <div
        className={`auth-input mt-1.5 flex items-center rounded-lg border bg-surface pr-1 transition-colors focus-within:ring-3 ${
          invalid
            ? "border-danger focus-within:border-danger focus-within:ring-danger/15"
            : "border-border focus-within:border-primary focus-within:ring-primary/15"
        }`}
      >
        <input
          id={id}
          type={visible ? "text" : "password"}
          required
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="min-w-0 flex-1 rounded-lg bg-transparent px-3 py-2.5 text-[15px] outline-none"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className={iconBtn}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          title={visible ? "Hide password" : "Show password"}
        >
          {visible ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={copy}
          disabled={!value}
          className={iconBtn}
          aria-label={copied ? "Password copied" : "Copy password"}
          title={copied ? "Copied" : "Copy password"}
        >
          {copied ? (
            <Check className="h-4 w-4 text-success" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>
      <span className="sr-only" aria-live="polite">
        {copied ? "Password copied to clipboard" : ""}
      </span>
      {showStrength && (
        <div className="mt-2">
          <div className="flex gap-1" aria-hidden>
            {[1, 2, 3, 4].map((n) => (
              <span
                key={n}
                className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                  score >= n
                    ? score <= 1
                      ? "bg-danger"
                      : score === 2
                        ? "bg-warning"
                        : "bg-success"
                    : "bg-border"
                }`}
              />
            ))}
          </div>
          <p
            id={`${id}-hint`}
            className="mt-1.5 flex justify-between text-xs text-muted"
          >
            <span>
              {hint ?? "At least 10 characters, with a letter and a digit."}
            </span>
            {value && <span className="tabular">{STRENGTH[score]}</span>}
          </p>
        </div>
      )}
      {!showStrength && hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
