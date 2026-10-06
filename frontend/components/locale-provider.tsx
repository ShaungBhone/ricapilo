"use client";
import { createContext, useContext, useState, useEffect } from "react";
import { NextIntlClientProvider } from "next-intl";
import { useRouter } from "next/navigation";
import { Locale } from "@/i18n/locales";
import my from "@/messages/my.json";
import en from "@/messages/en.json";
const LocaleContext = createContext<(locale: Locale) => void>(() => {});
export const useSetLocale = () => useContext(LocaleContext);
export function LocaleProvider({
  locale: initialLocale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocale] = useState(initialLocale);
  const router = useRouter();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  function changeLocale(next: Locale) {
    document.cookie = `locale=${next}; Max-Age=31536000; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    document.documentElement.lang = next;
    setLocale(next);
    router.refresh();
  }
  return (
    <LocaleContext.Provider value={changeLocale}>
      <NextIntlClientProvider
        locale={locale}
        timeZone="UTC"
        messages={locale === "my" ? my : en}
      >
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}
