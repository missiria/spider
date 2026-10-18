"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthTabs } from "@/components/auth/AuthTabs";
import { FormNotice, SubmitButton, TextField } from "@/components/auth/fields";
import { PasswordField } from "@/components/auth/PasswordField";
import { startSession } from "@/lib/api";

/**
 * Only same-origin targets: `?next=https://evil.example`, `//evil.example` or `/\\evil.example`
 * (browsers read the backslash as a slash) must not become an open redirect. Resolved the way
 * the browser will resolve it, then accepted only if the origin is still ours.
 */
function safeNext(raw: string | null): string {
  if (!raw || /[\\\u0000-\u001f]/.test(raw)) return "/";
  try {
    const url = new URL(raw, window.location.origin);
    const out = `${url.pathname}${url.search}${url.hash}`;
    // `/.//evil.example` normalises to the pathname `//evil.example`: protocol-relative again
    return url.origin === window.location.origin && !/^\/[\/\\]/.test(out)
      ? out
      : "/";
  } catch {
    return "/";
  }
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<{
    tone: "error" | "pending";
    message: string;
  } | null>(null);
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await startSession(email, password);
      router.push(safeNext(params.get("next")));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setNotice({
        tone: /awaiting approval|confirm your email/i.test(message)
          ? "pending"
          : "error",
        message,
      });
      setNonce((n) => n + 1);
      setBusy(false);
    }
  };

  return (
    <>
      <AuthTabs />
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1.5 text-[15px] text-muted">
        Sign in to see how your sites are doing today.
      </p>
      <form
        onSubmit={submit}
        className="auth-swap mt-8 space-y-5"
        noValidate={false}
      >
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
        />
        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          invalid={notice?.tone === "error"}
          aside={
            <Link
              href="/forgot-password"
              className="text-sm text-primary hover:underline"
            >
              Forgot password?
            </Link>
          }
        />
        {notice && (
          <FormNotice
            tone={notice.tone}
            message={notice.message}
            nonce={nonce}
          />
        )}
        <SubmitButton busy={busy} busyLabel="Signing in…">
          Sign in
        </SubmitButton>
      </form>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
