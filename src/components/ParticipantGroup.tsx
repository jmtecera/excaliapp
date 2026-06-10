import { For, Show } from "solid-js";
import { text } from "../i18n";
import type { WorkspaceMember } from "../types";
import { cn } from "../lib/utils";

export function ParticipantGroup(props: { members: WorkspaceMember[]; selfId: string }) {
  const visibleLimit = 5;

  return (
    <div class="flex items-center pl-1">
      <For each={props.members.slice(0, visibleLimit)}>
        {(member, index) => (
          <div
            class={cn(
              "group relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-background bg-muted text-[10px] font-semibold uppercase text-foreground shadow-sm",
              index() > 0 && "-ml-1.5",
              member.clientId === props.selfId && "ring-1 ring-foreground ring-offset-1 ring-offset-background",
            )}
            style={{ "z-index": String(visibleLimit - index()) }}
            title={`${member.name}${member.clientId === props.selfId ? ` (${text.participant.you})` : ""}`}
          >
            <Show
              when={member.avatarHash}
              fallback={<span>{initials(member.name)}</span>}
            >
              <img
                src={`https://www.gravatar.com/avatar/${member.avatarHash}?d=404&s=64`}
                alt=""
                class="relative z-10 size-full object-cover"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
              <span class="absolute inset-0 grid place-items-center">{initials(member.name)}</span>
            </Show>
          </div>
        )}
      </For>
      <Show when={props.members.length > visibleLimit}>
        <div class="-ml-1.5 grid size-8 shrink-0 place-items-center rounded-full border-2 border-background bg-muted text-[10px] font-medium text-muted-foreground shadow-sm">
          +{props.members.length - visibleLimit}
        </div>
      </Show>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("") || "?";
}
