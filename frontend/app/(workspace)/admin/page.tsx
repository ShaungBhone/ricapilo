"use client";
import { useEffect, useState } from "react";
import { api, json } from "@/lib/api";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/feedback";
export default function Admin() {
  const [key, setKey] = useState("");
  const [disabled, setDisabled] = useState("");
  const [message, setMessage] = useState("");
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    api<{ youtube_configured: boolean; disabled_models: string[] }>("/admin")
      .then((r) => {
        setAllowed(true);
        setDisabled(r.disabled_models.join("\n"));
        setMessage(
          r.youtube_configured
            ? "YouTube ချိတ်ဆက်ပြီးပါပြီ။"
            : "YouTube key ထည့်ရန် လိုပါသည်။",
        );
      })
      .catch((e) => setMessage(e.message));
  }, []);
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">စီမံခန့်ခွဲမှု</h1>
      <Feedback message={message} />
      {allowed && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("/admin", {
                method: "PUT",
                body: json({
                  youtube_key: key || null,
                  disabled_models: disabled
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                }),
              });
              setKey("");
              setMessage("သိမ်းပြီးပါပြီ။");
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="youtube">YouTube Data API key</FieldLabel>
              <Input
                id="youtube"
                type="password"
                autoComplete="off"
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="disabled">
                ပိတ်ထားမည့် model IDs (တစ်ကြောင်းစီ)
              </FieldLabel>
              <Textarea
                id="disabled"
                rows={7}
                value={disabled}
                onChange={(e) => setDisabled(e.target.value)}
              />
            </Field>
            <Button type="submit">သိမ်းရန်</Button>
          </FieldGroup>
        </form>
      )}
    </div>
  );
}
