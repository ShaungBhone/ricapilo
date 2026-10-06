"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { api, json, Assistant, Model } from "@/lib/api"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Feedback, Blank } from "@/components/feedback"
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
}
export default function Assistants() {
  const [list, setList] = useState<Assistant[]>([])
  const [models, setModels] = useState<Model[]>([])
  const [draft, setDraft] = useState<typeof initial & { id?: number }>(initial)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [audio, setAudio] = useState<string | null>(null)
  const refresh = () => api<Assistant[]>("/assistants").then(setList)
  useEffect(() => {
    refresh().catch((e) => setMessage(e.message))
    api<Model[]>("/models")
      .then(setModels)
      .catch((e) => setMessage(e.message))
  }, [])
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api(`/assistants${draft.id ? "/" + draft.id : ""}`, {
        method: draft.id ? "PUT" : "POST",
        body: json(draft),
      })
      await refresh()
      setDraft(initial)
      setEditing(false)
      setMessage("လက်ထောက် သိမ်းပြီးပါပြီ။")
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const voiceOptions =
    models.find((m) => m.kind === "speech" && m.id === draft.tts_model)
      ?.voices || []
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">လက်ထောက်များ</h1>
        <Button
          onClick={() => {
            setDraft(initial)
            setEditing(true)
          }}
        >
          လက်ထောက်အသစ်
        </Button>
      </div>
      <Feedback message={message} />
      {audio && <audio controls autoPlay src={audio} className="w-full" />}
      {editing && (
        <Card>
          <CardHeader>
            <CardTitle>
              {draft.id ? "လက်ထောက် ပြင်ဆင်ရန်" : "လက်ထောက် ဖန်တီးရန်"}
            </CardTitle>
            <CardDescription>
              Model နှင့် voice ID များကို အချိန်မရွေး ပြောင်းနိုင်ပါသည်။
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form id="assistant-form" onSubmit={save}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="name">အမည်</FieldLabel>
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
                              "AI model",
                              "အသံမှ စာပြောင်း model",
                              "အသံဖန်တီး model",
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
                            Model ရွေးပါ
                          </NativeSelectOption>
                          {models
                            .filter(
                              (m) =>
                                m.kind ===
                                ["text", "transcription", "speech"][i]
                            )
                            .map((m) => (
                              <NativeSelectOption key={m.id} value={m.id}>
                                {m.name}
                              </NativeSelectOption>
                            ))}
                        </NativeSelect>
                      </Field>
                    )
                  )}
                </div>
                <Field>
                  <FieldLabel htmlFor="voice">Voice ID</FieldLabel>
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
                      const id = typeof v === "string" ? v : v.id
                      return <option key={id} value={id} />
                    })}
                  </datalist>
                </Field>
                <Field>
                  <FieldLabel htmlFor="instructions">
                    လက်ထောက်အတွက် ညွှန်ကြားချက်
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
                  <FieldLabel htmlFor="greeting">ပထမနှုတ်ဆက်စကား</FieldLabel>
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
                    စကားပြောပြီးနောက် စောင့်ချိန် (ms)
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
                  <FieldLabel htmlFor="enabled">အသုံးပြုမှု</FieldLabel>
                  <NativeSelect
                    id="enabled"
                    value={String(draft.enabled)}
                    onChange={(e) =>
                      setDraft({ ...draft, enabled: e.target.value === "true" })
                    }
                  >
                    <NativeSelectOption value="true">
                      ဖွင့်ထားရန်
                    </NativeSelectOption>
                    <NativeSelectOption value="false">
                      ပိတ်ထားရန်
                    </NativeSelectOption>
                  </NativeSelect>
                </Field>
              </FieldGroup>
            </form>
          </CardContent>
          <CardFooter className="gap-3">
            <Button disabled={busy} form="assistant-form" type="submit">
              သိမ်းရန်
            </Button>
            <Button variant="outline" onClick={() => setEditing(false)}>
              ပယ်ဖျက်ရန်
            </Button>
          </CardFooter>
        </Card>
      )}
      {!list.length && !editing && (
        <Blank
          title="လက်ထောက် မရှိသေးပါ"
          description="သင့် model၊ voice နှင့် ညွှန်ကြားချက်များဖြင့် လက်ထောက်တစ်ခု ဖန်တီးပါ။"
        />
      )}
      <div className="grid gap-5 md:grid-cols-2">
        {list.map((a) => (
          <Card key={a.id}>
            <CardHeader>
              <CardTitle>{a.name}</CardTitle>
              <CardDescription>
                {a.enabled ? "အသုံးပြုနိုင်သည်" : "ပိတ်ထားသည်"}
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
                စကားပြောရန်
              </Link>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    const r = await api<{ audio: string }>(
                      `/assistants/${a.id}/preview`,
                      { method: "POST" }
                    )
                    setAudio("data:audio/mpeg;base64," + r.audio)
                  } catch (e) {
                    setMessage((e as Error).message)
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                အသံ နားထောင်ရန်
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDraft(a)
                  setEditing(true)
                }}
              >
                ပြင်ဆင်ရန်
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (!confirm("ဤလက်ထောက်ကို ဖျက်မလား။")) return
                  try {
                    await api(`/assistants/${a.id}`, { method: "DELETE" })
                    await refresh()
                  } catch (e) {
                    setMessage((e as Error).message)
                  }
                }}
              >
                ဖျက်ရန်
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  )
}
