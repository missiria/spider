"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, ErrorBox } from "@/components/ui";
import { errorMessage, startSession } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await startSession(email, password);
      router.push(params.get("next") || "/");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-sm">
      <div className="mb-6 flex items-center gap-2 text-lg font-semibold">
        <span className="inline-block h-6 w-6 rounded-md bg-primary" aria-hidden />
        Spider
      </div>
      <label className="block text-sm">
        <span className="text-muted">Email</span>
        <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-md border border-border px-3 py-2 outline-none focus:border-primary" />
      </label>
      <label className="mt-4 block text-sm">
        <span className="text-muted">Password</span>
        <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-md border border-border px-3 py-2 outline-none focus:border-primary" />
      </label>
      {error && <div className="mt-4"><ErrorBox message={error} /></div>}
      <Button type="submit" disabled={busy} className="mt-6 w-full">
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
