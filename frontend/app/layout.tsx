import { getLocale, getTranslations } from "next-intl/server";
import { LocaleProvider } from "@/components/locale-provider";
import { resolveLocale } from "@/i18n/locales";
import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource/noto-sans-myanmar/400.css";
import "@fontsource/noto-sans-myanmar/600.css";
import "@fontsource/noto-sans-myanmar/700.css";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shared");
  return {
    title: { default: t("siteTitle"), template: "%s | Ricapilo" },
    description: t("siteDescription"),
  };
}
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = resolveLocale(await getLocale());
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <LocaleProvider locale={locale}>
          <ThemeProvider>
            <TooltipProvider>{children}</TooltipProvider>
            <Toaster />
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
