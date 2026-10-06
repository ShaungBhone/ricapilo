"use client";
import { localizeMessage } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
export function Feedback({ message }: { message: string }) {
  const locale = resolveLocale(useLocale());
  const t = useTranslations();

  return message ? (
    <Alert role="status">
      <AlertTitle>{t("shared.notice")}</AlertTitle>
      <AlertDescription className="whitespace-pre-line">
        {localizeMessage(message, locale)}
      </AlertDescription>
    </Alert>
  ) : null;
}
export function Blank({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
