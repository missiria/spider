"use client";

import axios from "axios";
import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, Card } from "@/components/ui";
import {
  approveSignup,
  errorMessage,
  listSignups,
  rejectSignup,
  type PendingSignup,
} from "@/lib/api";
import { formatDateTime } from "@/lib/format";

/**
 * Self-service signups waiting for review (operators only: the API answers 403 to everyone
 * else, and the card then stays hidden). Approving creates the person's own empty workspace.
 */
export function SignupsCard() {
  const [items, setItems] = useState<PendingSignup[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await listSignups());
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 403)
        setItems(null);
      else toast.error(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (s: PendingSignup, approve: boolean) => {
    if (
      !approve &&
      !window.confirm(`Reject ${s.email}? They will not be able to sign in.`)
    )
      return;
    setBusyId(s.id);
    try {
      if (approve) await approveSignup(s.id);
      else await rejectSignup(s.id);
      toast.success(
        approve ? `${s.name} approved and notified` : `${s.email} rejected`,
      );
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  if (items === null) return null;

  return (
    <Card className="p-5">
      <h2 className="font-medium">Signups</h2>
      <p className="mt-1 text-sm text-muted">
        People who asked for an account. Approving gives them their own empty
        workspace and emails them. Only approve people you know: an approved
        account can add any property the Spider service account can read.
      </p>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No signups waiting.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {items.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {s.name}
                  {s.company && (
                    <span className="font-normal text-muted">
                      {" "}
                      ({s.company})
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-muted">
                  {s.email}, requested {formatDateTime(s.created_at)}
                </div>
              </div>
              <Button
                variant="secondary"
                disabled={busyId === s.id}
                onClick={() => act(s, false)}
              >
                Reject
              </Button>
              <Button disabled={busyId === s.id} onClick={() => act(s, true)}>
                Approve
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
