"use client";

import Link from "next/link";
import { Loader2, MailCheck, MailX } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { DoneState } from "@/components/auth/fields";
import { verifyEmail } from "@/lib/api";

const secondaryLink =
  "inline-flex w-full justify-center rounded-lg border border-border bg-surface px-4 py-2.5 text-[15px] font-medium hover:bg-surface-muted";

/** Opened from the signup email: confirms the address once, on load. */
function Verify() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"working" | "done" | "failed">(
    token ? "working" : "failed",
  );
  const [message, setMessage] = useState(
    "This link is incomplete. Open it exactly as it was sent.",
  );
  const sent = useRef(false);

  useEffect(() => {
    // strict mode mounts twice in dev; the token is single use
    if (!token || sent.current) return;
    sent.current = true;
    verifyEmail(token)
      .then(() => setState("done"))
      .catch((err: unknown) => {
        setMessage(err instanceof Error ? err.message : String(err));
        setState("failed");
      });
  }, [token]);

  if (state === "working") {
    return (
      <div
        className="flex items-center gap-3 text-[15px] text-muted"
        role="status"
      >
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        Confirming your email…
      </div>
    );
  }
  if (state === "done") {
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
  return (
    <DoneState
      icon={<MailX className="h-5 w-5" />}
      title="We couldn't confirm this email"
      action={
        <Link href="/register" className={secondaryLink}>
          Sign up again
        </Link>
      }
    >
      {message}
    </DoneState>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}
