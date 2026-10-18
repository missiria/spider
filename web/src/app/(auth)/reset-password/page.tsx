"use client";

import Link from "next/link";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { DoneState, FormNotice, SubmitButton } from "@/components/auth/fields";
import {
  meetsPasswordRule,
  PasswordField,
} from "@/components/auth/PasswordField";
import { endSession, resetPassword } from "@/lib/api";

const primaryLink =
  "inline-flex w-full justify-center rounded-lg bg-primary px-4 py-2.5 text-[15px] font-medium text-white hover:bg-primary-hover";

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const mismatch = confirm.length > 0 && confirm !== password;

  if (!token) {
    return (
      <DoneState
        icon={<KeyRound className="h-5 w-5" />}
        title="This link is incomplete"
        action={
          <Link href="/forgot-password" className={primaryLink}>
            Get a new reset link
          </Link>
        }
      >
        Open the link from your reset email exactly as it was sent, or ask for a
        new one.
      </DoneState>
    );
  }

  if (done) {
    return (
      <DoneState
        icon={<ShieldCheck className="h-5 w-5" />}
        title="Password updated"
        action={
          <Link href="/login" className={primaryLink}>
            Sign in
          </Link>
        }
      >
        Every device that was signed in to this account has been signed out.
        Sign in again with your new password.
      </DoneState>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!meetsPasswordRule(password)) {
      setError("Use at least 10 characters, with a letter and a digit.");
    } else if (password !== confirm) {
      setError("The two passwords are different.");
    } else {
      setBusy(true);
      try {
        await resetPassword(token, password);
        await endSession();
        setDone(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    }
    setNonce((n) => n + 1);
  };

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        Choose a new password
      </h1>
      <p className="mt-1.5 text-[15px] text-muted">
        You will be signed out of every device once it is saved.
      </p>
      <form onSubmit={submit} className="auth-swap mt-8 space-y-5">
        <PasswordField
          label="New password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          showStrength
        />
        <PasswordField
          label="Confirm new password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          invalid={mismatch}
          hint={mismatch ? "Doesn't match yet." : undefined}
        />
        {error && <FormNotice tone="error" message={error} nonce={nonce} />}
        <SubmitButton busy={busy} busyLabel="Saving…">
          Save new password
        </SubmitButton>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
