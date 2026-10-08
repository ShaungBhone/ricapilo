import type { Caption } from "@/lib/api";

export type TranscriptWord = {
  captionIndex: number;
  endMs: number;
  endOffset: number;
  index: number;
  startMs: number;
  startOffset: number;
  text: string;
};

export type TranscriptPart =
  { kind: "text"; text: string } | { kind: "word"; word: TranscriptWord };

export type WordSelection = {
  anchorIndex: number;
  endIndex: number;
  focusIndex: number;
  startIndex: number;
};

type RawPart = {
  endOffset: number;
  isWord: boolean;
  startOffset: number;
  text: string;
};

const fallbackParts = (text: string): RawPart[] => {
  const wordPattern = /[\p{L}\p{M}\p{N}]+(?:[’'][\p{L}\p{M}\p{N}]+)*/gu;
  const parts: RawPart[] = [];
  let offset = 0;

  for (const match of text.matchAll(wordPattern)) {
    const startOffset = match.index;
    if (startOffset > offset) {
      parts.push({
        endOffset: startOffset,
        isWord: false,
        startOffset: offset,
        text: text.slice(offset, startOffset),
      });
    }
    const value = match[0];
    const endOffset = startOffset + value.length;
    parts.push({
      endOffset,
      isWord: true,
      startOffset,
      text: value,
    });
    offset = endOffset;
  }

  if (offset < text.length) {
    parts.push({
      endOffset: text.length,
      isWord: false,
      startOffset: offset,
      text: text.slice(offset),
    });
  }

  return parts;
};

const segmentCaption = (text: string): RawPart[] => {
  if (typeof Intl.Segmenter !== "function") return fallbackParts(text);

  const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
  return Array.from(segmenter.segment(text), (part) => ({
    endOffset: part.index + part.segment.length,
    isWord: part.isWordLike === true,
    startOffset: part.index,
    text: part.segment,
  }));
};

const characterLength = (text: string) => Math.max(1, Array.from(text).length);

/**
 * Produces clickable Unicode words while keeping every non-word character in
 * the rendered part stream. Word times are estimated proportionally by
 * character count until the backend provides word-level timestamps.
 */
export const createTranscriptParts = (
  captions: Caption[],
): TranscriptPart[] => {
  const result: TranscriptPart[] = [];
  let wordIndex = 0;

  captions.forEach((caption, captionIndex) => {
    if (
      captionIndex > 0 &&
      !/\s$/u.test(captions[captionIndex - 1].text) &&
      !/^\s/u.test(caption.text)
    ) {
      result.push({ kind: "text", text: "\n" });
    }
    const rawParts = segmentCaption(caption.text);
    const rawWords = rawParts.filter((part) => part.isWord);
    const totalWeight = rawWords.reduce(
      (sum, word) => sum + characterLength(word.text),
      0,
    );
    const duration = Math.max(0, caption.endMs - caption.startMs);
    let elapsedWeight = 0;

    rawParts.forEach((part) => {
      if (!part.isWord) {
        if (part.text) result.push({ kind: "text", text: part.text });
        return;
      }

      const weight = characterLength(part.text);
      const startMs =
        caption.startMs +
        (totalWeight === 0 ? 0 : (elapsedWeight / totalWeight) * duration);
      elapsedWeight += weight;
      const endMs =
        caption.startMs +
        (totalWeight === 0
          ? duration
          : (elapsedWeight / totalWeight) * duration);

      result.push({
        kind: "word",
        word: {
          captionIndex,
          endMs,
          endOffset: part.endOffset,
          index: wordIndex,
          startMs,
          startOffset: part.startOffset,
          text: part.text,
        },
      });
      wordIndex += 1;
    });
  });

  return result;
};

export const transcriptWords = (parts: TranscriptPart[]) =>
  parts.flatMap((part) => (part.kind === "word" ? [part.word] : []));

export const createWordSelection = (
  words: TranscriptWord[],
  anchorIndex: number,
  focusIndex: number,
): WordSelection | null => {
  if (
    !Number.isInteger(anchorIndex) ||
    !Number.isInteger(focusIndex) ||
    anchorIndex < 0 ||
    focusIndex < 0 ||
    anchorIndex >= words.length ||
    focusIndex >= words.length
  ) {
    return null;
  }

  return {
    anchorIndex,
    focusIndex,
    startIndex: Math.min(anchorIndex, focusIndex),
    endIndex: Math.max(anchorIndex, focusIndex),
  };
};

export const selectedWords = (
  words: TranscriptWord[],
  selection: WordSelection,
) => words.slice(selection.startIndex, selection.endIndex + 1);

export const selectionText = (
  words: TranscriptWord[],
  selection: WordSelection,
) =>
  selectedWords(words, selection)
    .map((word) => word.text)
    .join(" ");

export const updateSelectedWord = (
  captions: Caption[],
  words: TranscriptWord[],
  selection: WordSelection,
  text: string,
): Caption[] => {
  if (selection.startIndex !== selection.endIndex || !text.trim()) {
    return captions;
  }

  const word = words[selection.startIndex];
  const caption = word ? captions[word.captionIndex] : undefined;
  if (!word || !caption) return captions;

  return captions.map((item, index) =>
    index === word.captionIndex
      ? {
          ...item,
          text:
            item.text.slice(0, word.startOffset) +
            text.trim() +
            item.text.slice(word.endOffset),
        }
      : item,
  );
};

const tidyDeletedText = (text: string, hadTrailingWhitespace: boolean) => {
  const cleaned = text
    .replace(/[\t ]{2,}/gu, " ")
    .replace(/\s+([,.;:!?])/gu, "$1")
    .trim();

  return cleaned && hadTrailingWhitespace ? `${cleaned} ` : cleaned;
};

export const deleteSelectedWords = (
  captions: Caption[],
  words: TranscriptWord[],
  selection: WordSelection,
): Caption[] => {
  const removals = new Map<number, TranscriptWord[]>();

  selectedWords(words, selection).forEach((word) => {
    const captionRemovals = removals.get(word.captionIndex) ?? [];
    captionRemovals.push(word);
    removals.set(word.captionIndex, captionRemovals);
  });

  return captions.flatMap((caption, captionIndex) => {
    const captionRemovals = removals.get(captionIndex);
    if (!captionRemovals?.length) return [caption];

    const hadTrailingWhitespace = /\s$/u.test(caption.text);
    const nextText = [...captionRemovals]
      .sort((a, b) => b.startOffset - a.startOffset)
      .reduce(
        (text, word) =>
          text.slice(0, word.startOffset) + text.slice(word.endOffset),
        caption.text,
      );
    const tidiedText = tidyDeletedText(nextText, hadTrailingWhitespace);
    const hasWords = segmentCaption(tidiedText).some((part) => part.isWord);

    return tidiedText && hasWords ? [{ ...caption, text: tidiedText }] : [];
  });
};
