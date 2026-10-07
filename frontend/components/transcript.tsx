"use client";
import { useTranslations } from "next-intl";

import { Conversation } from "@/lib/api";
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from "@/components/ui/message-scroller";
import {
  Message,
  MessageContent,
  MessageHeader,
} from "@/components/ui/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { cn } from "cn";
export function Transcript({
  messages,
  className,
}: {
  messages: Conversation["messages"];
  className?: string;
}) {
  const t = useTranslations();

  return (
    <div className={cn("h-[420px]", className)}>
      <MessageScrollerProvider autoScroll>
        <MessageScroller>
          <MessageScrollerViewport>
            <MessageScrollerContent className="p-4">
              {messages.map((m, i) => (
                <MessageScrollerItem
                  key={i}
                  messageId={String(i)}
                  scrollAnchor={m.role === "user"}
                >
                  <Message align={m.role === "user" ? "end" : "start"}>
                    <MessageContent>
                      <MessageHeader>
                        {m.role === "user"
                          ? t("conversations.you")
                          : t("conversations.aiAssistant")}
                      </MessageHeader>
                      <Bubble
                        align={m.role === "user" ? "end" : "start"}
                        variant={m.role === "user" ? "default" : "secondary"}
                      >
                        <BubbleContent className="leading-8 whitespace-pre-wrap">
                          {m.content}
                        </BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              ))}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
    </div>
  );
}
