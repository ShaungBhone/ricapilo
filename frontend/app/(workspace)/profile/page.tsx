"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/feedback";
import { useUser } from "@/components/workspace";
import { api, ApiError, User } from "@/lib/api";

export default function Profile() {
  const t = useTranslations();
  const router = useRouter();
  const [user, setUser] = useState(useUser());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);

  useEffect(() => {
    let pending = false;
    const controller = new AbortController();
    async function refresh() {
      if (pending || controller.signal.aborted) return;
      pending = true;
      try {
        const updated = await api<User>("/auth/me", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setUser(updated);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          router.replace("/login");
        } else {
          setMessage((error as Error).message);
        }
      } finally {
        pending = false;
      }
    }
    function onVisible() {
      if (document.visibilityState === "visible") void refresh();
    }
    void refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller.abort();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  async function resend() {
    if (sending.current || !user || user.email_verified_at) return;
    sending.current = true;
    setBusy(true);
    setMessage("");
    try {
      await api("/email/resend", { method: "POST" });
      setMessage(t("workspace.verificationEmailSent"));
    } catch (error) {
      setMessage(
        error instanceof ApiError && error.status === 429
          ? t("profile.resendLimitReached")
          : (error as Error).message,
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  if (!user) return null;

  const verified = !!user.email_verified_at;
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("profile.title")}</h1>
      <Feedback message={message} />
      <Card>
        <CardHeader>
          <CardTitle>{t("profile.accountDetails")}</CardTitle>
          <CardDescription>{t("profile.accountDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">{t("profile.name")}</dt>
              <dd>{user.name}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">{t("profile.email")}</dt>
              <dd className="break-all">{user.email}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">
                {t("profile.emailVerification")}
              </dt>
              <dd>
                <Badge variant={verified ? "secondary" : "outline"}>
                  {t(verified ? "profile.verified" : "profile.notVerified")}
                </Badge>
              </dd>
            </div>
          </dl>
        </CardContent>
        {!verified && (
          <CardFooter className="flex-col items-start gap-4">
            <p className="text-sm text-muted-foreground">
              {t(
                user.email_verification_required
                  ? "workspace.verifyYourEmailBeforeUsingAi"
                  : "workspace.youCanVerifyYourEmailAiIsAlso",
              )}
            </p>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void resend()}
            >
              {t(
                busy ? "profile.sending" : "workspace.resendVerificationEmail",
              )}
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
