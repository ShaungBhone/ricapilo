"use client";
import { Tabs as Primitive } from "@base-ui/react/tabs";
import { cn } from "@/lib/utils";
export function Tabs({ className, ...props }: Primitive.Root.Props) {
  return (
    <Primitive.Root
      className={cn("flex min-h-0 flex-col gap-3", className)}
      {...props}
    />
  );
}
export function TabsList({ className, ...props }: Primitive.List.Props) {
  return (
    <Primitive.List
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-lg bg-muted p-1",
        className,
      )}
      {...props}
    />
  );
}
export function TabsTrigger({ className, ...props }: Primitive.Tab.Props) {
  return (
    <Primitive.Tab
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring data-active:bg-background data-active:text-foreground",
        className,
      )}
      {...props}
    />
  );
}
export function TabsContent({ className, ...props }: Primitive.Panel.Props) {
  return (
    <Primitive.Panel
      className={cn("min-h-0 flex-1 outline-none", className)}
      {...props}
    />
  );
}
