import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { createAvatarHash } from "./avatar";
import { normalizeMember } from "./workspace";
import type { Workspace, WorkspaceMember } from "./types";

const SUPABASE_URL = String(import.meta.env.VITE_PUBLIC_SUPABASE_URL || "").trim();
const SUPABASE_KEY = String(
  import.meta.env.VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY ||
    "",
).trim();
const PRESENCE_HEARTBEAT_MS = 30000;

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

  let heartbeat = 0;
  let disposed = false;
  const updatePresence = () => onPresence(readPresence(channel));

  channel
    .on("broadcast", { event: "changed" }, onChanged)
    .on("presence", { event: "sync" }, updatePresence)
    .on("presence", { event: "join" }, updatePresence)
    .on("presence", { event: "leave" }, updatePresence)
    .subscribe(async (status) => {
      if (status !== "SUBSCRIBED") {
        return;
      }

      const trackPresence = () =>
        channel.track({
          clientId: workspace.clientId,
          name: workspace.memberName,
          avatarHash: createAvatarHash(workspace.memberEmail),
          device: workspace.device,
          lastSeenAt: Date.now(),
        });

      await trackPresence();
      if (disposed) {
        void channel.untrack();
        return;
      }

      updatePresence();
      heartbeat = window.setInterval(() => void trackPresence(), PRESENCE_HEARTBEAT_MS);
    });

  return () => {
    disposed = true;
    window.clearInterval(heartbeat);
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
