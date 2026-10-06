"use client";
import { useLocale, useTranslations } from "next-intl";
import { useSetLocale } from "@/components/locale-provider";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { resolveLocale } from "@/i18n/locales";
export function LanguageSelector() {
  const locale = useLocale();
  const t = useTranslations("shared");
  const setLocale = useSetLocale();
  return (
    <NativeSelect
      aria-label={t("language")}
      value={locale}
      onChange={(event) => setLocale(resolveLocale(event.target.value))}
    >
      <NativeSelectOption value="my">မြန်မာ</NativeSelectOption>
      <NativeSelectOption value="en">English</NativeSelectOption>
    </NativeSelect>
  );
}
