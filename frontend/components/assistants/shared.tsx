"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { localizeMessage } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";

export function AssistantStatus({ enabled }: { enabled: boolean }) {
  const t = useTranslations("assistants");
  return (
    <Badge variant={enabled ? "secondary" : "outline"}>
      {t(enabled ? "enabled" : "disabled")}
    </Badge>
  );
}

export function AssistantError({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  const t = useTranslations();
  const locale = resolveLocale(useLocale());
  return (
    <Alert variant="destructive">
      <AlertTitle>{t("shared.notice")}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        {localizeMessage(message, locale)}
        {retry && (
          <Button variant="outline" size="sm" onClick={retry}>
            {t("workspace.tryAgain")}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function AssistantSkeleton() {
  const t = useTranslations("assistants");
  return (
    <div
      role="status"
      aria-label={t("loading")}
      className="flex flex-col gap-6 p-6"
    >
      <span className="sr-only">{t("loading")}</span>
      <Skeleton className="h-8 w-48" />
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

export function AssistantConfirmation({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  busy = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  busy?: boolean;
}) {
  const t = useTranslations("assistants");
  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
      <SheetContent showCloseButton={!busy}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {t("cancel")}
          </Button>
          <Button variant="destructive" disabled={busy} onClick={onConfirm}>
            {t("confirm")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
