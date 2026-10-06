"use client";
import { useTranslations } from "next-intl";
import { LanguageSelector } from "@/components/language-selector";
import Link from "next/link";
import { AudioLines } from "lucide-react";
import { LoginForm } from "@/components/login-form";
export default function Page() {
  const t = useTranslations();

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 bg-muted/40 p-6">
      <Link href="/" className="flex items-center gap-2 text-xl font-semibold">
        <AudioLines /> Ricapilo
      </Link>
      <div className="w-full max-w-sm">
        <LoginForm mode="forgot" />
      </div>
      <LanguageSelector />
      <p className="text-center text-sm text-muted-foreground">
        {t("authentication.yourPersonalAiBurmeseStories")}
      </p>
    </main>
  );
}
