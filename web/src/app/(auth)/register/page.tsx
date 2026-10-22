"use client";

import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Suspense, useState } from "react";
import { AuthTabs } from "@/components/auth/AuthTabs";
import {
  DoneState,
  FormNotice,
  SubmitButton,
  TextField,
} from "@/components/auth/fields";
import {
  meetsPasswordRule,
  PasswordField,
} from "@/components/auth/PasswordField";
import { registerAccount } from "@/lib/api";

function RegisterForm() {
  const [form, setForm] = useState({
    name: "",
    company: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!meetsPasswordRule(form.password)) {
      setError("Use at least 10 characters, with a letter and a digit.");
      setNonce((n) => n + 1);
      return;
    }
    setBusy(true);
    try {
      await registerAccount({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        ...(form.company.trim() ? { company: form.company.trim() } : {}),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setNonce((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <DoneState
        icon={<MailCheck className="h-5 w-5" />}
        title="Confirm your email"
        action={
          <Link
            href="/login"
            className="inline-flex w-full justify-center rounded-lg border border-border bg-surface px-4 py-2.5 text-[15px] font-medium hover:bg-surface-muted"
          >
            Back to sign in
          </Link>
        }
      >
        We sent a link to{" "}
        <span className="font-medium text-foreground">{form.email}</span>. Open
        it within 24 hours to confirm the address. An admin then approves your
        request (usually within one business day), and we email you once you can
        sign in.
      </DoneState>
    );
  }

  return (
    <>
      <AuthTabs />
      <h1 className="text-2xl font-semibold tracking-tight">
        Create your account
      </h1>
      <p className="mt-1.5 text-[15px] text-muted">
        Confirm by email, then an admin approves (usually within one business
        day).
      </p>
      <form onSubmit={submit} className="auth-swap mt-8 space-y-5">
        <TextField
          label="Full name"
          autoComplete="name"
          value={form.name}
          onChange={(e) => set("name")(e.target.value)}
          maxLength={120}
          autoFocus
        />
        <TextField
          label="Company"
          optional
          autoComplete="organization"
          value={form.company}
          onChange={(e) => set("company")(e.target.value)}
          maxLength={120}
        />
        <TextField
          label="Work email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(e) => set("email")(e.target.value)}
          maxLength={255}
        />
        <PasswordField
          label="Password"
          value={form.password}
          onChange={set("password")}
          autoComplete="new-password"
          showStrength
        />
        {error && <FormNotice tone="error" message={error} nonce={nonce} />}
        <SubmitButton busy={busy} busyLabel="Sending request…">
          Request access
        </SubmitButton>
      </form>
    </>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
