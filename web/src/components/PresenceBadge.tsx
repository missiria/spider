import { formatAgo } from "@/lib/format";
import type { Presence } from "@/lib/types";

/** Members panel presence (MISS-0199): online, last seen, or nothing recorded yet. */
export function PresenceBadge({
  presence,
  showSessions,
}: {
  presence?: Presence;
  showSessions: boolean;
}) {
  if (!presence) return null;
  if (presence.online) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-success">
        <span aria-hidden className="h-2 w-2 rounded-full bg-success" />
        Online
        {showSessions && presence.sessions > 1 && (
          <span className="text-muted">· {presence.sessions} sessions</span>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      <span aria-hidden className="h-2 w-2 rounded-full bg-muted" />
      {presence.last_seen_at
        ? `Last seen ${formatAgo(presence.last_seen_at)}`
        : "Not seen yet"}
    </span>
  );
}
