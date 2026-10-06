"use client";
import { useTranslations } from "next-intl";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Send } from "lucide-react";
import { api, json, Assistant, Conversation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Feedback } from "@/components/feedback";
import { Transcript } from "@/components/transcript";
import { useMicrophone } from "@/hooks/use-microphone";
export default function Talk() {
  const t = useTranslations();

  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [selected, setSelected] = useState("");
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [continuous, setContinuous] = useState(false);
  const player = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);
  const version = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    api<Assistant[]>("/assistants").then((a) => {
      setAssistants(a.filter((x) => x.enabled));
      setSelected(
        new URLSearchParams(location.search).get("assistant") ||
          String(a[0]?.id || ""),
      );
    });
    return () => {
      player.current?.pause();
      controller.current?.abort();
      if (url.current) URL.revokeObjectURL(url.current);
    };
  }, []);
  async function send(blob?: Blob) {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    const current = ++version.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    try {
      let body: BodyInit;
      if (blob) {
        const f = new FormData();
        f.append(
          "audio",
          blob,
          blob.type.includes("ogg") ? "voice.ogg" : "voice.webm",
        );
        f.append("assistant_id", selected);
        f.append("speak", "1");
        if (conversation) f.append("conversation_id", String(conversation.id));
        body = f;
      } else {
        body = json({
          text,
          assistant_id: Number(selected),
          conversation_id: conversation?.id,
          speak: true,
        });
      }
      const r = await api<{ conversation: Conversation; audio: string | null }>(
        "/talk",
        { method: "POST", body, signal: abort.signal },
      );
      if (current !== version.current) return;
      setConversation(r.conversation);
      setText("");
      if (r.audio) {
        if (url.current) URL.revokeObjectURL(url.current);
        const bytes = Uint8Array.from(atob(r.audio), (c) => c.charCodeAt(0));
        url.current = URL.createObjectURL(
          new Blob([bytes], { type: "audio/mpeg" }),
        );
        const audio = new Audio(url.current);
        player.current = audio;
        await audio.play();
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setMessage((e as Error).message);
    } finally {
      if (current === version.current) setBusy(false);
    }
  }
  const chosen = assistants.find((a) => String(a.id) === selected);
  const mic = useMicrophone(
    (blob) => void send(blob),
    chosen?.silence_ms || 1200,
    true,
    () => {
      player.current?.pause();
    },
  );
  const micActive = mic.active;
  const startMic = mic.start;
  useEffect(() => {
    if (continuous && !busy && !micActive && !message) {
      void startMic();
    }
  }, [continuous, busy, micActive, startMic, message]);
  function end() {
    setContinuous(false);
    mic.stop(true);
    player.current?.pause();
    controller.current?.abort();
    version.current++;
    setBusy(false);
  }
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">
        {t("conversations.liveConversation")}
      </h1>
      <Field>
        <FieldLabel htmlFor="assistant">
          {t("conversations.assistant")}
        </FieldLabel>
        <NativeSelect
          id="assistant"
          value={selected}
          disabled={continuous || busy}
          onChange={(e) => {
            setSelected(e.target.value);
            setConversation(null);
          }}
        >
          <NativeSelectOption value="">
            {t("conversations.choose")}
          </NativeSelectOption>
          {assistants.map((a) => (
            <NativeSelectOption key={a.id} value={a.id}>
              {a.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Feedback message={message || mic.error} />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={!selected}
          onClick={() => {
            if (continuous) {
              end();
            } else {
              setMessage("");
              setContinuous(true);
            }
          }}
        >
          {continuous ? (
            <Square data-icon="inline-start" />
          ) : (
            <Mic data-icon="inline-start" />
          )}
          {continuous
            ? t("conversations.stopConversation")
            : t("conversations.startMicrophone")}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            player.current?.pause();
            controller.current?.abort();
            version.current++;
            setBusy(false);
          }}
        >
          {t("conversations.stopAudioResponse")}
        </Button>
        <p role="status" className="text-sm text-muted-foreground">
          {busy
            ? t("conversations.thinking")
            : mic.active
              ? t("conversations.listening")
              : t("conversations.ready")}
        </p>
      </div>
      <Transcript
        messages={
          conversation?.messages ||
          (chosen?.first_message
            ? [{ role: "assistant", content: chosen.first_message }]
            : [])
        }
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="message">
              {t("conversations.typeAMessage")}
            </FieldLabel>
            <Input
              id="message"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
            />
          </Field>
          <Button disabled={busy || !text.trim() || !selected} type="submit">
            <Send data-icon="inline-start" />
            {t("conversations.send")}
          </Button>
        </FieldGroup>
      </form>
      <p className="text-xs leading-6 text-muted-foreground">
        {t("conversations.audioIsRecordedAndAnsweredOneTurnAt")}
      </p>
    </div>
  );
}
