"use client";

import { Popover as Primitive } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";

export const Popover = Primitive.Root;
export const PopoverPortal = Primitive.Portal;

export function PopoverPositioner({
  className,
  ...props
}: Primitive.Positioner.Props) {
  return (
    <Primitive.Positioner
      className={cn("isolate z-50", className)}
      {...props}
    />
  );
}

export function PopoverPopup({ className, ...props }: Primitive.Popup.Props) {
  return (
    <Primitive.Popup
      className={cn(
        "max-w-(--available-width) rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg outline-none",
        className,
      )}
      {...props}
    />
  );
}
