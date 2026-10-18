"use client";

import Link from "next/link";
import { MailCheck, MailX } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { DoneState, FormNotice, SubmitButton } from "@/components/auth/fields";
import { PasswordField } from "@/components/auth/PasswordField";
import { verifyEmail } from "@/lib/api";

const secondaryLink =
  "inline-flex w-full justify-center rounded-lg border border-border bg-surface px-4 py-2.5 text-[15px] font-medium hover:bg-surface-muted";

/**
 * Opened from the signup email. Asks for the password chosen at signup: confirming needs both
 * the inbox and the password, so nobody can get someone else's address approved.
 */
function Verify() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <DoneState
        icon={<MailX className="h-5 w-5" />}
        title="This link is incomplete"
        action={
          <Link href="/register" className={secondaryLink}>
            Sign up again
          </Link>
        }
      >
        Open the link from your confirmation email exactly as it was sent.
      </DoneState>
    );
  }

  if (done) {
    return (
      <DoneState
        icon={<MailCheck className="h-5 w-5" />}
        title="Email confirmed"
        action={
          <Link href="/login" className={secondaryLink}>
            Back to sign in
          </Link>
        }
      >
        Thanks. An admin now reviews your request, and we email you as soon as
        you can sign in.
      </DoneState>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await verifyEmail(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setNonce((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        Confirm your email
      </h1>
      <p className="mt-1.5 text-[15px] text-muted">
        Enter the password you chose when you signed up.
      </p>
      <form onSubmit={submit} className="auth-swap mt-8 space-y-5">
        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          invalid={!!error}
        />
        {error && <FormNotice tone="error" message={error} nonce={nonce} />}
        <SubmitButton busy={busy} busyLabel="Confirming…">
          Confirm email
        </SubmitButton>
      </form>
    </>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}
