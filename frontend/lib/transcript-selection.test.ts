import { test } from "node:test";
import assert from "node:assert/strict";
import type { Caption } from "@/lib/api";
import {
  createTranscriptParts,
  transcriptWords,
  createWordSelection,
  updateSelectedWord,
  deleteSelectedWords,
} from "./transcript-selection";
import { editHistory, moveHistory, changes, type EditorDraft } from "./editor";
const captions: Caption[] = [
  { text: "Hello, beautiful world! ", startMs: 0, endMs: 3000 },
  { text: "Next scene.", startMs: 4000, endMs: 6000 },
];
const words = transcriptWords(createTranscriptParts(captions));
test("segmentation preserves punctuation, whitespace, and Unicode text", () => {
  for (const text of [
    "Hello,\n beautiful  world!",
    "မြန်မာစာ စမ်းသပ်ခြင်း။",
    "秋天一定要来看哟！",
    "Don't stop 👋",
  ]) {
    const parts = createTranscriptParts([{ text, startMs: 100, endMs: 2100 }]);
    assert.equal(
      parts
        .map((part) => (part.kind === "text" ? part.text : part.word.text))
        .join(""),
      text,
    );
    const tokens = transcriptWords(parts);
    assert.ok(tokens.length > 0);
    assert.equal(tokens[0].startMs, 100);
    assert.equal(tokens.at(-1)!.endMs, 2100);
    for (const token of tokens) {
      assert.equal(text.slice(token.startOffset, token.endOffset), token.text);
      assert.ok(
        token.startMs >= 100 &&
          token.endMs <= 2100 &&
          token.endMs > token.startMs,
      );
    }
  }
});
test("separate captions cannot accidentally join adjacent words", () => {
  const parts = createTranscriptParts([
    { text: "One", startMs: 0, endMs: 100 },
    { text: "Two", startMs: 100, endMs: 200 },
  ]);
  assert.equal(
    parts
      .map((part) => (part.kind === "text" ? part.text : part.word.text))
      .join(""),
    "One\nTwo",
  );
});
test("single-word edits preserve other text and all timings", () => {
  const selection = createWordSelection(words, 1, 1)!;
  const updated = updateSelectedWord(captions, words, selection, "lovely");
  assert.equal(updated[0].text, "Hello, lovely world! ");
  assert.equal(updated[0].startMs, captions[0].startMs);
  assert.equal(updated[0].endMs, captions[0].endMs);
  assert.equal(updated[1], captions[1]);
  assert.equal(updateSelectedWord(captions, words, selection, "  "), captions);
});
test("reverse selections delete across captions without changing timings", () => {
  const selection = createWordSelection(words, 3, 1)!;
  assert.deepEqual([selection.startIndex, selection.endIndex], [1, 3]);
  const updated = deleteSelectedWords(captions, words, selection);
  assert.equal(updated[1].text, "scene.");
  assert.deepEqual(
    updated.map(({ startMs, endMs }) => ({ startMs, endMs })),
    captions.map(({ startMs, endMs }) => ({ startMs, endMs })),
  );
  assert.deepEqual(
    deleteSelectedWords(
      captions,
      words,
      createWordSelection(words, 0, words.length - 1)!,
    ),
    [],
  );
});
test("Burmese replacement preserves text outside selected offsets", () => {
  const input = [{ text: "မြန်မာစာ စမ်းသပ်ခြင်း။", startMs: 0, endMs: 2000 }];
  const tokens = transcriptWords(createTranscriptParts(input));
  const updated = updateSelectedWord(
    input,
    tokens,
    createWordSelection(tokens, 0, 0)!,
    "အသစ်",
  );
  assert.equal(
    updated[0].text,
    "အသစ်" + input[0].text.slice(tokens[0].endOffset),
  );
});
test("empty, punctuation-only, zero-duration captions and invalid selections remain safe", () => {
  assert.deepEqual(createTranscriptParts([]), []);
  assert.deepEqual(
    transcriptWords(
      createTranscriptParts([{ text: "?!", startMs: 0, endMs: 0 }]),
    ),
    [],
  );
  const tokens = transcriptWords(
    createTranscriptParts([{ text: "Hello", startMs: 100, endMs: 100 }]),
  );
  assert.equal(tokens[0].startMs, 100);
  assert.equal(tokens[0].endMs, 100);
  assert.equal(createWordSelection(tokens, -1, 0), null);
  assert.equal(createWordSelection(tokens, 0, 3), null);
});
test("caption operations integrate with draft undo, redo, and save deltas", () => {
  const draft = {
    title: "Test",
    transcript: "Source",
    script: "Script",
    captions,
    caption_style: "clean-bottom",
    editor_settings: {},
  } as EditorDraft;
  const next = {
    ...draft,
    captions: updateSelectedWord(
      captions,
      words,
      createWordSelection(words, 1, 1)!,
      "lovely",
    ),
  };
  const history = editHistory({ past: [], present: draft, future: [] }, next);
  assert.equal(moveHistory(history, "undo").present, draft);
  assert.deepEqual(
    moveHistory(moveHistory(history, "undo"), "redo").present,
    next,
  );
  assert.deepEqual(changes(next, draft), { captions: next.captions });
});
