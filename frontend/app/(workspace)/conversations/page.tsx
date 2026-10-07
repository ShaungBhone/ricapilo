"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, MessagesSquare } from "lucide-react";
import { api, Conversation, Page } from "@/lib/api";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Blank, Feedback } from "@/components/feedback";
import { Transcript } from "@/components/transcript";
import { useIsMobile } from "@/hooks/use-mobile";

export default function Conversations() {
  const t = useTranslations();
  const mobile = useIsMobile();
  const [list, setList] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<Page<Conversation>>("/conversations")
      .then((r) => {
        if (!cancelled) setList(r.data);
      })
      .catch((e) => {
        if (!cancelled) setMessage(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [retry]);

  const conversationList = (
    <nav
      aria-label={t("workspace.conversations")}
      className="h-full overflow-y-auto bg-sidebar"
    >
      {loading ? (
        <div className="flex flex-col gap-4 p-4" aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : message ? (
        <div className="flex flex-col gap-4 p-4">
          <p role="alert">{message}</p>
          <Button
            variant="outline"
            onClick={() => {
              setMessage("");
              setLoading(true);
              setRetry((r) => r + 1);
            }}
          >
            {t("workspace.tryAgain")}
          </Button>
        </div>
      ) : !list.length ? (
        <Blank
          title={t("conversations.noConversationsYet")}
          description={t("conversations.chooseAnAssistantAndStartTalking")}
        />
      ) : (
        <ul className="flex flex-col gap-1 p-2">
          {list.map((c) => (
            <li key={c.id}>
              <Button
                variant={selected?.id === c.id ? "secondary" : "ghost"}
                className="h-auto w-full justify-start px-3 py-4"
                aria-pressed={selected?.id === c.id}
                aria-label={`${t("conversations.viewTranscript")}: ${c.title}`}
                onClick={() => setSelected(c)}
              >
                <MessagesSquare data-icon="inline-start" />
                <span className="flex min-w-0 flex-1 flex-col gap-1 text-start">
                  <span className="truncate">{c.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {t("shared.messageCount", { count: c.messages.length })}
                  </span>
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );

  const conversationDetail = selected ? (
    <section
      aria-label={selected.title}
      className="flex h-full min-h-0 min-w-0 flex-col"
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b p-4">
        <div className="flex min-w-0 items-center gap-2">
          {mobile && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("conversations.backToConversations")}
              onClick={() => setSelected(null)}
            >
              <ArrowLeft />
            </Button>
          )}
          <h2 className="truncate font-semibold">{selected.title}</h2>
        </div>
        <Link
          className={buttonVariants({ variant: "outline", size: "sm" })}
          href={`/talk?assistant=${selected.assistant_id}`}
        >
          {t("conversations.newConversation")}
        </Link>
      </header>
      <Transcript
        key={selected.id}
        messages={selected.messages}
        className="min-h-0 flex-1"
      />
    </section>
  ) : (
    <div className="flex h-full items-center justify-center p-6">
      <Blank
        title={t("conversations.noConversationSelected")}
        description={t("conversations.selectConversation")}
      />
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6">
        <MessagesSquare aria-hidden="true" className="size-5" />
        <h1 className="font-semibold">{t("workspace.conversations")}</h1>
      </header>
      <Feedback message={message} />
      {mobile ? (
        <div className="min-h-0 flex-1">
          {selected ? conversationDetail : conversationList}
        </div>
      ) : (
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 flex-1"
        >
          <ResizablePanel
            id="conversation-list"
            defaultSize="320px"
            minSize="240px"
            maxSize="480px"
          >
            {conversationList}
          </ResizablePanel>
          <ResizableHandle
            withHandle
            aria-label={t("conversations.resizePanels")}
          />
          <ResizablePanel id="conversation-detail" minSize="280px">
            {conversationDetail}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
}
