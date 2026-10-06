"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Feedback } from "@/components/feedback";
import { api, json } from "@/lib/api";
export function LoginForm({
  mode = "login",
}: {
  mode?: "login" | "register" | "forgot" | "reset";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const title = {
    login: "ပြန်လည်ကြိုဆိုပါတယ်",
    register: "အကောင့်အသစ် ဖွင့်ပါ",
    forgot: "စကားဝှက် ပြန်သတ်မှတ်ပါ",
    reset: "စကားဝှက်အသစ် ထည့်ပါ",
  }[mode];
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (mode === "reset") {
      data.token = new URLSearchParams(location.search).get("token") || "";
    }
    try {
      await api(`/auth/${mode}`, { method: "POST", body: json(data) });
      if (mode === "login" || mode === "register") {
        router.push("/");
        router.refresh();
      } else {
        setMessage(
          mode === "forgot"
            ? "အကောင့်ရှိပါက စကားဝှက်ပြန်သတ်မှတ်ရန် အီးမေးလ် ပို့ပြီးပါပြီ။"
            : "စကားဝှက်အသစ်ဖြင့် ဝင်ရောက်နိုင်ပါပြီ။",
        );
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>
            သင့်ဇာတ်လမ်းကို မြန်မာဘာသာဖြင့် ဖန်တီးပါ။
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit}>
            <FieldGroup>
              {mode === "register" && (
                <Field>
                  <FieldLabel htmlFor="name">အမည်</FieldLabel>
                  <Input id="name" name="name" required autoComplete="name" />
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="email">အီးမေးလ်</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  defaultValue={
                    mode === "reset" && typeof window !== "undefined"
                      ? new URLSearchParams(window.location.search).get(
                          "email",
                        ) || ""
                      : ""
                  }
                />
              </Field>
              {mode !== "forgot" && (
                <Field>
                  <FieldLabel htmlFor="password">စကားဝှက်</FieldLabel>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    required
                    minLength={mode === "login" ? 1 : 10}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                  />
                  {mode !== "login" && (
                    <FieldDescription>
                      အနည်းဆုံး ၁၀ လုံး၊ အက္ခရာနှင့် နံပါတ် ပါဝင်ရမည်။
                    </FieldDescription>
                  )}
                </Field>
              )}
              {(mode === "register" || mode === "reset") && (
                <Field>
                  <FieldLabel htmlFor="password_confirmation">
                    စကားဝှက် ထပ်ထည့်ပါ
                  </FieldLabel>
                  <Input
                    id="password_confirmation"
                    name="password_confirmation"
                    type="password"
                    required
                    autoComplete="new-password"
                  />
                </Field>
              )}
              <Feedback message={message} />
              <Field>
                <Button disabled={busy} type="submit">
                  {busy ? "ခဏစောင့်ပါ…" : title}
                </Button>
                {mode === "login" && (
                  <FieldDescription className="text-center">
                    <Link href="/forgot-password">စကားဝှက် မေ့နေပါသလား။</Link>
                  </FieldDescription>
                )}
                <FieldDescription className="text-center">
                  <Link href={mode === "login" ? "/register" : "/login"}>
                    {mode === "login"
                      ? "အကောင့်အသစ် ဖွင့်ရန်"
                      : "အကောင့်ဝင်ရန်"}
                  </Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
