import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createTranslator } from "next-intl";
import { resolveLocale } from "./locales";
import { localizeMessage } from "./messages";
import my from "@/messages/my.json";
import en from "@/messages/en.json";

describe("translation catalogs", () => {
  test("interface messages do not name video source providers", () => {
    for (const catalog of [en, my]) {
      for (const entries of Object.values(catalog)) {
        for (const message of Object.values(entries)) {
          assert.doesNotMatch(message, /youtube|bilibili/i);
        }
      }
    }
  });
  test("both languages have the same keys and valid ICU messages", () => {
    assert.deepEqual(Object.keys(my).sort(), Object.keys(en).sort());
    for (const group of Object.keys(my) as (keyof typeof my)[]) {
      assert.deepEqual(
        Object.keys(my[group]).sort(),
        Object.keys(en[group]).sort(),
      );
    }
    for (const [group, entries] of Object.entries(my)) {
      for (const [key, value] of Object.entries(entries)) {
        const placeholders = (message: string) =>
          [
            ...new Set(
              [...message.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)(?:,|\})/g)].map(
                (match) => match[1],
              ),
            ),
          ].sort();
        assert.deepEqual(
          placeholders(value),
          placeholders(
            (en as Record<string, Record<string, string>>)[group][key],
          ),
        );
      }
    }
    for (const [locale, messages] of [
      ["my", my],
      ["en", en],
    ] as const) {
      const t = createTranslator({
        locale,
        messages,
        onError: (error) => {
          throw error;
        },
      });
      for (const [group, entries] of Object.entries(messages)) {
        for (const [key, message] of Object.entries(entries)) {
          assert.notEqual(
            t(`${group}.${key}` as Parameters<typeof t>[0], {
              ...Object.fromEntries(
                [...message.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)(?:,|\})/g)].map(
                  (match) => [match[1], "example"],
                ),
              ),
              count: 2,
              page: 1,
              total: 5,
            }),
            `${group}.${key}`,
          );
        }
      }
    }
  });
  test("invalid and absent cookie values default to Burmese", () => {
    assert.equal(resolveLocale(undefined), "my");
    assert.equal(resolveLocale("fr"), "my");
    assert.equal(resolveLocale("../en"), "my");
    assert.equal(resolveLocale("en"), "en");
  });
  test("counts use the active locale and English plural rules", () => {
    const english = createTranslator({ locale: "en", messages: en });
    assert.equal(english("shared.messageCount", { count: 1 }), "1 message");
    assert.equal(english("shared.messageCount", { count: 2 }), "2 messages");
    const burmese = createTranslator({ locale: "my", messages: my });
    assert.match(burmese("shared.messageCount", { count: 2 }), /၂/);
  });
  test("tracked generation errors switch language without fetching again", () => {
    const keys = [
      "apiOpenrouterInsufficientCredits",
      "apiOpenrouterRateLimited",
      "apiOpenrouterTemporarilyUnavailable",
      "apiOpenrouterConnectionFailed",
      "apiOpenrouterAccessRejected",
      "apiRecapWritingFailedUnknownCause",
      "apiDiscoveryFailedUnknownCause",
      "apiTranscriptionFailedUnknownCause",
      "apiNarrationFailedUnknownCause",
      "apiTranscriptionReturnedNoText",
      "apiNarrationReturnedInvalidAudio",
      "apiNarrationAudioConversionFailed",
    ] as const;
    for (const key of keys) {
      const trackedError = en.shared[key];
      assert.equal(localizeMessage(trackedError, "my"), my.shared[key]);
      assert.equal(localizeMessage(my.shared[key], "en"), trackedError);
    }
  });
  test("displayed API warnings and generation errors follow language changes", () => {
    const message = "The source has no audio.";
    const translated = localizeMessage(message, "my");
    assert.equal(translated, "ရင်းမြစ်တွင် အသံမရှိပါ။");
    assert.equal(localizeMessage(translated, "en"), message);
    const warnings =
      "Video search is temporarily unavailable.\nVideo search is temporarily unavailable. Please try again.";
    assert.equal(
      localizeMessage(localizeMessage(warnings, "my"), "en"),
      warnings,
    );
    assert.equal(
      localizeMessage("Unknown provider error XYZ", "my"),
      "Unknown provider error XYZ",
    );
  });
});
