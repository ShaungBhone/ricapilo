import my from "@/messages/my.json";
import en from "@/messages/en.json";
import { browserLocale, Locale } from "./locales";
export function translateMessage(
  key: string,
  locale: Locale = browserLocale(),
): string {
  const [group, name] = key.split(".");
  const catalog = (locale === "my" ? my : en) as Record<
    string,
    Record<string, string>
  >;
  return catalog[group]?.[name] ?? key;
}
export function localizeMessage(message: string, locale: Locale): string {
  if (message.includes("\n"))
    return message
      .split("\n")
      .map((line) => localizeMessage(line, locale))
      .join("\n");
  const translated = translateMessage(message, locale);
  if (translated !== message) return translated;
  for (const catalog of [my, en]) {
    for (const [group, entries] of Object.entries(catalog)) {
      for (const [key, value] of Object.entries(entries)) {
        if (value === message)
          return translateMessage(`${group}.${key}`, locale);
      }
    }
  }
  return message;
}
