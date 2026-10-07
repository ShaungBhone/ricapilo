"use client";
import { localizeMessage } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";
import { useEffect, useId } from "react";
import { toast } from "sonner";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
export function Feedback({ message }: { message: string }) {
  const locale = resolveLocale(useLocale());
  const t = useTranslations();
  const id = useId();
  const title = t("shared.notice");
  const description = localizeMessage(message, locale);

  useEffect(() => {
    if (description) {
      toast(title, { id, description });
    } else {
      toast.dismiss(id);
    }
  }, [description, id, title]);

  return null;
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
