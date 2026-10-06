"use client";
import { useTranslations } from "next-intl";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  const t = useTranslations();

  const router = useRouter();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const title = {
    login: t("authentication.welcomeBack"),
    register: t("authentication.createAnAccount"),
    forgot: t("authentication.resetYourPassword"),
    reset: t("authentication.enterANewPassword"),
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
            ? t("authentication.ifThatAccountExistsAPasswordResetEmail")
            : t("authentication.youCanNowSignInWithYourNew"),
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
            {t("authentication.createYourStoryInBurmese")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit}>
            <FieldGroup>
              {mode === "register" && (
                <Field>
                  <FieldLabel htmlFor="name">
                    {t("authentication.name")}
                  </FieldLabel>
                  <Input id="name" name="name" required autoComplete="name" />
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="email">
                  {t("authentication.email")}
                </FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  defaultValue={
                    mode === "reset" ? searchParams.get("email") || "" : ""
                  }
                />
              </Field>
              {mode !== "forgot" && (
                <Field>
                  <FieldLabel htmlFor="password">
                    {t("authentication.password")}
                  </FieldLabel>
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
                      {t(
                        "authentication.atLeast10CharactersIncludingLettersAndNumbers",
                      )}
                    </FieldDescription>
                  )}
                </Field>
              )}
              {(mode === "register" || mode === "reset") && (
                <Field>
                  <FieldLabel htmlFor="password_confirmation">
                    {t("authentication.confirmPassword")}
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
                  {busy ? t("authentication.pleaseWait") : title}
                </Button>
                {mode === "login" && (
                  <FieldDescription className="text-center">
                    <Link href="/forgot-password">
                      {t("authentication.forgotYourPassword")}
                    </Link>
                  </FieldDescription>
                )}
                <FieldDescription className="text-center">
                  <Link href={mode === "login" ? "/register" : "/login"}>
                    {mode === "login"
                      ? t("authentication.register")
                      : t("authentication.signIn")}
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
