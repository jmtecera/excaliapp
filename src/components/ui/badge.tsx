import { splitProps, type JSX, type ParentProps } from "solid-js";
import { cn } from "../../lib/utils";

export function Badge(props: ParentProps<{ class?: string; title?: string } & JSX.HTMLAttributes<HTMLSpanElement>>) {
  const [local, badgeProps] = splitProps(props, ["class", "children"]);
  return (
    <span
      class={cn(
        "inline-flex h-6 items-center rounded-full border border-border bg-muted px-2.5 text-xs font-medium text-muted-foreground",
        local.class,
      )}
      {...badgeProps}
    >
      {local.children}
    </span>
  );
}
