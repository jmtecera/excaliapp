import md5 from "blueimp-md5";
import { For, Show } from "solid-js";
import { text } from "../i18n";
import type { WorkspaceMember } from "../types";
import { cn } from "../lib/utils";

export function ParticipantGroup(props: { members: WorkspaceMember[]; selfId: string }) {
  return (
    <div class="flex items-center">
      <For each={props.members.slice(0, 6)}>
        {(member, index) => (
          <div
            class={cn(
              "group relative grid size-8 place-items-center overflow-hidden rounded-full border-2 border-background bg-muted text-[10px] font-semibold uppercase text-foreground shadow-sm",
              index() > 0 && "-ml-2",
              member.clientId === props.selfId && "ring-1 ring-foreground ring-offset-1 ring-offset-background",
            )}
            title={`${member.name}${member.clientId === props.selfId ? ` (${text.participant.you})` : ""}`}
          >
            <Show
              when={member.email}
              fallback={<span>{initials(member.name)}</span>}
            >
              <img
                src={`https://www.gravatar.com/avatar/${md5(member.email)}?d=404&s=64`}
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
      <Show when={props.members.length > 6}>
        <div class="-ml-2 grid size-8 place-items-center rounded-full border-2 border-background bg-muted text-[10px] font-medium text-muted-foreground">
          +{props.members.length - 6}
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
