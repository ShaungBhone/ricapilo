"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { api, json, Assistant, Project } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Feedback } from "@/components/feedback"
export default function NewProject() {
  const router = useRouter()
  const [assistants, setAssistants] = useState<Assistant[]>([])
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api<Assistant[]>("/assistants")
      .then(setAssistants)
      .catch((e) => setMessage(e.message))
  }, [])
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    const f = new FormData(e.currentTarget)
    try {
      const p = await api<Project>("/projects", {
        method: "POST",
        body: json({
          title: f.get("title"),
          assistant_id: Number(f.get("assistant")),
          source: "upload",
          transcript: f.get("transcript") || null,
          target_seconds: Number(f.get("seconds")),
          format: f.get("format"),
        }),
      })
      const file = f.get("file") as File
      if (file?.size) {
        const upload = new FormData()
        upload.append("file", file)
        await api(`/projects/${p.id}/upload`, { method: "POST", body: upload })
      }
      router.push(`/projects/${p.id}`)
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">ပရောဂျက်အသစ်</h1>
      <Feedback message={message} />
      <form onSubmit={submit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="title">ဇာတ်လမ်းအမည်</FieldLabel>
            <Input id="title" name="title" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="assistant">လက်ထောက်</FieldLabel>
            <NativeSelect id="assistant" name="assistant" required>
              <NativeSelectOption value="">ရွေးချယ်ပါ</NativeSelectOption>
              {assistants
                .filter((a) => a.enabled)
                .map((a) => (
                  <NativeSelectOption value={a.id} key={a.id}>
                    {a.name}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="file">ဗီဒီယို သို့မဟုတ် အသံဖိုင်</FieldLabel>
            <Input
              id="file"
              name="file"
              type="file"
              accept="video/mp4,video/webm,video/quicktime,audio/*"
            />
            <FieldDescription>
              အများဆုံး 300 MB။ ရှည်လျားသောရင်းမြစ်အတွက် စာသားလည်း
              ထည့်နိုင်ပါသည်။
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="transcript">မူရင်း စာသား</FieldLabel>
            <Textarea
              id="transcript"
              name="transcript"
              rows={8}
              placeholder="မည်သည့်ဘာသာစကားမဆို ထည့်နိုင်ပါသည်။"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="seconds">
              အနှစ်ချုပ်ကြာချိန် (စက္ကန့်)
            </FieldLabel>
            <Input
              id="seconds"
              name="seconds"
              type="number"
              min={15}
              max={600}
              defaultValue={60}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="format">ဗီဒီယိုအချိုး</FieldLabel>
            <NativeSelect id="format" name="format">
              <NativeSelectOption value="vertical">
                ဒေါင်လိုက် 9:16
              </NativeSelectOption>
              <NativeSelectOption value="landscape">
                အလျားလိုက် 16:9
              </NativeSelectOption>
            </NativeSelect>
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? "သိမ်းနေပါသည်…" : "ပရောဂျက် ဖန်တီးရန်"}
          </Button>
        </FieldGroup>
      </form>
    </div>
  )
}
