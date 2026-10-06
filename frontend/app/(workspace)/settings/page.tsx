"use client";
import { useTranslations } from "next-intl";

import { useEffect, useState } from "react";
import { api, json } from "@/lib/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Feedback } from "@/components/feedback";
export default function Settings() {
  const t = useTranslations();

  const [configured, setConfigured] = useState(false);
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ provider: string }[]>("/keys")
      .then((keys) =>
        setConfigured(keys.some((k) => k.provider === "openrouter")),
      )
      .catch((e) => setMessage(e.message));
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/keys", { method: "PUT", body: json({ secret }) });
      setSecret("");
      setConfigured(true);
      setMessage(t("settings.apiKeySaved"));
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("workspace.settings")}</h1>
      <Feedback message={message} />
      <Card>
        <CardHeader>
          <CardTitle>OpenRouter</CardTitle>
          <CardDescription>
            {t("settings.createTextAudioAndRecapsWithYourOwn")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form id="key-form" onSubmit={save}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="key">
                  {t("settings.apiKey")}{" "}
                  <Badge variant="secondary">
                    {configured
                      ? t("settings.connected")
                      : t("settings.notConnected")}
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
                  {t("settings.yourKeyIsStoredEncryptedAndCannotBe")}
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
        <CardFooter className="gap-3">
          <Button disabled={busy} type="submit" form="key-form">
            {t("settings.saveKey")}
          </Button>
          {configured && (
            <Button
              variant="outline"
              onClick={async () => {
                if (!confirm(t("settings.removeTheApiKey"))) return;
                try {
                  await api("/keys", { method: "DELETE" });
                  setConfigured(false);
                } catch (e) {
                  setMessage((e as Error).message);
                }
              }}
            >
              {t("settings.removeKey")}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
