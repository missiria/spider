"use client";

import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { useState } from "react";
import {
  DoneState,
  FormNotice,
  SubmitButton,
  TextField,
} from "@/components/auth/fields";
import { requestPasswordReset } from "@/lib/api";

const backLink = (
  <Link
    href="/login"
    className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
  >
    <ArrowLeft className="h-4 w-4" aria-hidden />
    Back to sign in
  </Link>
);

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setNonce((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <DoneState
        icon={<Mail className="h-5 w-5" />}
        title="Check your inbox"
        action={backLink}
      >
        If an account exists for{" "}
        <span className="font-medium text-foreground">{email}</span>, a reset
        link is on its way. It works once, for 30 minutes. Nothing there after a
        few minutes? Check spam, or{" "}
        <button
          type="button"
          onClick={() => setSent(false)}
          className="text-primary hover:underline"
        >
          send it again
        </button>
        .
      </DoneState>
    );
  }

  return (
    <>
      <div className="mb-8">{backLink}</div>
      <h1 className="text-2xl font-semibold tracking-tight">
        Reset your password
      </h1>
      <p className="mt-1.5 text-[15px] text-muted">
        Enter the email you sign in with and we will send you a reset link.
      </p>
      <form onSubmit={submit} className="auth-swap mt-8 space-y-5">
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
        />
        {error && <FormNotice tone="error" message={error} nonce={nonce} />}
        <SubmitButton busy={busy} busyLabel="Sending link…">
          Send reset link
        </SubmitButton>
      </form>
    </>
  );
}
