import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { normalizeMember } from "./workspace";
import type { Workspace, WorkspaceMember } from "./types";

const SUPABASE_URL = String(import.meta.env.VITE_PUBLIC_SUPABASE_URL || "").trim();
const SUPABASE_KEY = String(
  import.meta.env.VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY ||
    "",
).trim();

const client =
  SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false },
        realtime: { params: { eventsPerSecond: 10 } },
      })
    : null;

export function subscribeToRoom({
  workspace,
  onChanged,
  onPresence,
}: {
  workspace: Workspace;
  onChanged: () => void;
  onPresence: (members: WorkspaceMember[]) => void;
}): () => void {
  if (!client || !workspace.roomId) {
    return () => undefined;
  }

  const channel = client.channel(`room:${workspace.roomId}`, {
    config: {
      broadcast: { self: false },
      presence: { key: workspace.clientId },
      private: false,
    },
  });

  channel
    .on("broadcast", { event: "changed" }, onChanged)
    .on("presence", { event: "sync" }, () => onPresence(readPresence(channel)))
    .subscribe(async (status) => {
      if (status !== "SUBSCRIBED") {
        return;
      }

      await channel.track({
        clientId: workspace.clientId,
        name: workspace.memberName,
        email: workspace.memberEmail,
        device: workspace.device,
        lastSeenAt: Date.now(),
      });
    });

  return () => {
    void channel.untrack();
    void client.removeChannel(channel);
  };
}

function readPresence(channel: RealtimeChannel): WorkspaceMember[] {
  return Object.values(channel.presenceState())
    .flat()
    .map(normalizeMember)
    .filter((member): member is WorkspaceMember => Boolean(member));
}
