"use client";
import { useTranslations } from "next-intl";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, json, Assistant, Model } from "@/lib/api";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Feedback, Blank } from "@/components/feedback";
const initial = {
  name: "",
  instructions: "မြန်မာဘာသာဖြင့် ရှင်းလင်းပြီး သဘာဝကျစွာ ပြောဆိုပါ။",
  first_message: "မင်္ဂလာပါ။ ဘာကူညီပေးရမလဲ။",
  llm_model: "",
  stt_model: "",
  tts_model: "",
  voice: "",
  silence_ms: 1200,
  enabled: true,
};
export default function Assistants() {
  const t = useTranslations();

  const [list, setList] = useState<Assistant[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [draft, setDraft] = useState<typeof initial & { id?: number }>(initial);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [audio, setAudio] = useState<string | null>(null);
  const refresh = () => api<Assistant[]>("/assistants").then(setList);
  useEffect(() => {
    refresh().catch((e) => setMessage(e.message));
    api<Model[]>("/models")
      .then(setModels)
      .catch((e) => setMessage(e.message));
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/assistants${draft.id ? "/" + draft.id : ""}`, {
        method: draft.id ? "PUT" : "POST",
        body: json(draft),
      });
      await refresh();
      setDraft(initial);
      setEditing(false);
      setMessage(t("assistants.assistantSaved"));
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const voiceOptions =
    models.find((m) => m.kind === "speech" && m.id === draft.tts_model)
      ?.voices || [];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("workspace.assistants")}</h1>
        <Button
          onClick={() => {
            setDraft(initial);
            setEditing(true);
          }}
        >
          {t("assistants.newAssistant")}
        </Button>
      </div>
      <Feedback message={message} />
      {audio && <audio controls autoPlay src={audio} className="w-full" />}
      {editing && (
        <Card>
          <CardHeader>
            <CardTitle>
              {draft.id
                ? t("assistants.editAssistant")
                : t("assistants.createAssistant")}
            </CardTitle>
            <CardDescription>
              {t("assistants.youCanChangeModelAndVoiceIdsAt")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form id="assistant-form" onSubmit={save}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="name">
                    {t("authentication.name")}
                  </FieldLabel>
                  <Input
                    id="name"
                    required
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                  />
                </Field>
                <div className="grid gap-5 md:grid-cols-3">
                  {(["llm_model", "stt_model", "tts_model"] as const).map(
                    (key, i) => (
                      <Field key={key}>
                        <FieldLabel htmlFor={key}>
                          {
                            [
                              t("shared.aiModel"),
                              t("assistants.transcriptionModel"),
                              t("assistants.speechModel"),
                            ][i]
                          }
                        </FieldLabel>
                        <NativeSelect
                          id={key}
                          required
                          value={draft[key]}
                          onChange={(e) =>
                            setDraft({ ...draft, [key]: e.target.value })
                          }
                          className="w-full"
                        >
                          <NativeSelectOption value="">
                            {t("assistants.chooseAModel")}
                          </NativeSelectOption>
                          {models
                            .filter(
                              (m) =>
                                m.kind ===
                                ["text", "transcription", "speech"][i],
                            )
                            .map((m) => (
                              <NativeSelectOption key={m.id} value={m.id}>
                                {m.name}
                              </NativeSelectOption>
                            ))}
                        </NativeSelect>
                      </Field>
                    ),
                  )}
                </div>
                <Field>
                  <FieldLabel htmlFor="voice">
                    {t("assistants.voiceId")}
                  </FieldLabel>
                  <Input
                    id="voice"
                    required
                    value={draft.voice}
                    onChange={(e) =>
                      setDraft({ ...draft, voice: e.target.value })
                    }
                    list="voices"
                  />
                  <datalist id="voices">
                    {voiceOptions.map((v) => {
                      const id = typeof v === "string" ? v : v.id;
                      return <option key={id} value={id} />;
                    })}
                  </datalist>
                </Field>
                <Field>
                  <FieldLabel htmlFor="instructions">
                    {t("assistants.assistantInstructions")}
                  </FieldLabel>
                  <Textarea
                    id="instructions"
                    required
                    rows={5}
                    value={draft.instructions}
                    onChange={(e) =>
                      setDraft({ ...draft, instructions: e.target.value })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="greeting">
                    {t("assistants.firstGreeting")}
                  </FieldLabel>
                  <Input
                    id="greeting"
                    value={draft.first_message}
                    onChange={(e) =>
                      setDraft({ ...draft, first_message: e.target.value })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="silence">
                    {t("assistants.silenceDelayAfterSpeakingMs")}
                  </FieldLabel>
                  <Input
                    id="silence"
                    type="number"
                    min={500}
                    max={3000}
                    value={draft.silence_ms}
                    onChange={(e) =>
                      setDraft({ ...draft, silence_ms: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="enabled">
                    {t("assistants.usage")}
                  </FieldLabel>
                  <NativeSelect
                    id="enabled"
                    value={String(draft.enabled)}
                    onChange={(e) =>
                      setDraft({ ...draft, enabled: e.target.value === "true" })
                    }
                  >
                    <NativeSelectOption value="true">
                      {t("assistants.enable")}
                    </NativeSelectOption>
                    <NativeSelectOption value="false">
                      {t("assistants.disable")}
                    </NativeSelectOption>
                  </NativeSelect>
                </Field>
              </FieldGroup>
            </form>
          </CardContent>
          <CardFooter className="gap-3">
            <Button disabled={busy} form="assistant-form" type="submit">
              {t("administration.save")}
            </Button>
            <Button variant="outline" onClick={() => setEditing(false)}>
              {t("assistants.cancel")}
            </Button>
          </CardFooter>
        </Card>
      )}
      {!list.length && !editing && (
        <Blank
          title={t("assistants.noAssistantsYet")}
          description={t("assistants.createAnAssistantWithYourModelsVoiceAnd")}
        />
      )}
      <div className="grid gap-5 md:grid-cols-2">
        {list.map((a) => (
          <Card key={a.id}>
            <CardHeader>
              <CardTitle>{a.name}</CardTitle>
              <CardDescription>
                {a.enabled ? t("assistants.enabled") : t("assistants.disabled")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="line-clamp-3 text-sm leading-7 text-muted-foreground">
                {a.instructions}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                {a.llm_model} · {a.voice}
              </p>
            </CardContent>
            <CardFooter className="flex-wrap gap-2">
              <Link
                className={buttonVariants({ size: "sm" })}
                href={`/talk?assistant=${a.id}`}
              >
                {t("assistants.talk")}
              </Link>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await api<{ audio: string }>(
                      `/assistants/${a.id}/preview`,
                      { method: "POST" },
                    );
                    setAudio("data:audio/mpeg;base64," + r.audio);
                  } catch (e) {
                    setMessage((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t("assistants.previewVoice")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDraft(a);
                  setEditing(true);
                }}
              >
                {t("assistants.edit")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (!confirm(t("assistants.deleteThisAssistant"))) return;
                  try {
                    await api(`/assistants/${a.id}`, { method: "DELETE" });
                    await refresh();
                  } catch (e) {
                    setMessage((e as Error).message);
                  }
                }}
              >
                {t("assistants.delete")}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
