"use client"
import { useEffect, useState } from "react"
import { api, json } from "@/lib/api"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Feedback } from "@/components/feedback"
export default function Settings() {
  const [configured, setConfigured] = useState(false)
  const [secret, setSecret] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api<{ provider: string }[]>("/keys")
      .then((keys) =>
        setConfigured(keys.some((k) => k.provider === "openrouter"))
      )
      .catch((e) => setMessage(e.message))
  }, [])
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api("/keys", { method: "PUT", body: json({ secret }) })
      setSecret("")
      setConfigured(true)
      setMessage("API key သိမ်းပြီးပါပြီ။")
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">ဆက်တင်များ</h1>
      <Feedback message={message} />
      <Card>
        <CardHeader>
          <CardTitle>OpenRouter</CardTitle>
          <CardDescription>
            သင့်ကိုယ်ပိုင် key ဖြင့် စာ၊ အသံနှင့် အနှစ်ချုပ် ဖန်တီးပါ။
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form id="key-form" onSubmit={save}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="key">
                  API key{" "}
                  <Badge variant="secondary">
                    {configured ? "ချိတ်ဆက်ပြီး" : "မချိတ်ဆက်ရသေး"}
                  </Badge>
                </FieldLabel>
                <Input
                  id="key"
                  type="password"
                  autoComplete="off"
                  required
                  minLength={15}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="sk-or-…"
                />
                <FieldDescription>
                  Key ကို encrypt လုပ်၍ သိမ်းပါမည်။ သိမ်းပြီးနောက် ပြန်မပြပါ။ AI
                  အသုံးစရိတ်သည် သင့် OpenRouter အကောင့်မှ ကျသင့်ပါမည်။
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
        <CardFooter className="gap-3">
          <Button disabled={busy} type="submit" form="key-form">
            Key သိမ်းရန်
          </Button>
          {configured && (
            <Button
              variant="outline"
              onClick={async () => {
                if (!confirm("API key ကို ဖယ်ရှားမလား။")) return
                try {
                  await api("/keys", { method: "DELETE" })
                  setConfigured(false)
                } catch (e) {
                  setMessage((e as Error).message)
                }
              }}
            >
              Key ဖယ်ရှားရန်
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
