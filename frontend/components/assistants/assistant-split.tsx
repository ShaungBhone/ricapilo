"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

export function AssistantSplit({
  navigation,
  children,
}: {
  navigation: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("assistants");
  const mobile = useIsMobile();
  if (mobile) return <div className="flex min-h-0 flex-1">{children}</div>;
  return (
    <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
      <ResizablePanel
        id="assistant-navigation"
        defaultSize="224px"
        minSize="160px"
        maxSize="320px"
      >
        <aside className="h-full overflow-y-auto bg-sidebar">
          {navigation}
        </aside>
      </ResizablePanel>
      <ResizableHandle withHandle aria-label={t("resizePanels")} />
      <ResizablePanel id="assistant-content" minSize="240px">
        <div className="flex h-full min-h-0 min-w-0 flex-col">{children}</div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
