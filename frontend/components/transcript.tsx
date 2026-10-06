"use client";
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
export function Transcript({
  messages,
}: {
  messages: Conversation["messages"];
}) {
  return (
    <div className="h-[420px]">
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
                        {m.role === "user" ? "သင်" : "AI လက်ထောက်"}
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
