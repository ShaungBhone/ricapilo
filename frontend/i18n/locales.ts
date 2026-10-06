export const locales = ["my", "en"] as const;
export type Locale = (typeof locales)[number];
export function resolveLocale(value: string | undefined): Locale {
  return locales.includes(value as Locale) ? (value as Locale) : "my";
}
export function browserLocale(): Locale {
  if (typeof document === "undefined") return "my";
  const cookie = document.cookie
    .split("; ")
    .find((item) => item.startsWith("locale="));
  return resolveLocale(cookie?.slice(7));
}
