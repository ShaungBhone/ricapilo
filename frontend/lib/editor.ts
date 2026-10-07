import type { Caption, Project } from "@/lib/api";
export type Slot = {
  assetId: string | null;
  mode: "fit" | "fill";
  x: number;
  y: number;
  scale: number;
  visible: boolean;
};
export type TextOverlay = {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  bold: boolean;
  background: boolean;
  align: "left" | "center" | "right";
  visible: boolean;
};
export type EditorSettings = {
  version: 1;
  aspectRatio: "9:16" | "16:9" | "1:1" | "4:5";
  layout: string;
  slots: Slot[];
  textOverlays: TextOverlay[];
  videoVisible: boolean;
  captionsVisible: boolean;
  audio: {
    sourceMuted: boolean;
    sourceVolume: number;
    narrationVolume: number;
    musicAssetId: string | null;
    musicVolume: number;
  };
};
export type EditorAsset = {
  id: string;
  name: string;
  kind: "video" | "audio";
  width: number;
  height: number;
  duration: number;
  hasAudio: boolean;
};
export type EditorDraft = {
  title: string;
  transcript: string;
  script: string;
  captions: Caption[];
  caption_style: string;
  editor_settings: EditorSettings;
};
export const emptySlot = (
  assetId: string | null = null,
  mode: Slot["mode"] = "fill",
): Slot => ({ assetId, mode, x: 0.5, y: 0.5, scale: 1, visible: true });
export function projectDraft(
  project: Project,
  assets: EditorAsset[],
): EditorDraft {
  return {
    title: project.title,
    transcript: project.transcript ?? "",
    script: project.script ?? "",
    captions: project.captions ?? [],
    caption_style: project.caption_style,
    editor_settings: project.editor_settings ?? {
      version: 1,
      aspectRatio: project.format === "landscape" ? "16:9" : "9:16",
      layout: "fill",
      slots: [
        emptySlot(
          assets.some((a) => a.id === "source" && a.kind === "video")
            ? "source"
            : null,
        ),
      ],
      textOverlays: [],
      videoVisible: true,
      captionsVisible: true,
      audio: {
        sourceMuted: true,
        sourceVolume: 1,
        narrationVolume: 1,
        musicAssetId: null,
        musicVolume: 0.22,
      },
    },
  };
}
export function changes(
  draft: EditorDraft,
  saved: EditorDraft,
): Partial<EditorDraft> {
  return Object.fromEntries(
    Object.entries(draft).filter(
      ([k, v]) =>
        JSON.stringify(v) !== JSON.stringify(saved[k as keyof EditorDraft]),
    ),
  );
}
export type History = {
  past: EditorDraft[];
  present: EditorDraft;
  future: EditorDraft[];
};
export function editHistory(history: History, next: EditorDraft): History {
  if (JSON.stringify(next) === JSON.stringify(history.present)) return history;
  return {
    past: [...history.past.slice(-99), history.present],
    present: next,
    future: [],
  };
}
export function moveHistory(
  history: History,
  direction: "undo" | "redo",
): History {
  if (direction === "undo") {
    const previous = history.past.at(-1);
    return previous
      ? {
          past: history.past.slice(0, -1),
          present: previous,
          future: [history.present, ...history.future],
        }
      : history;
  }
  const next = history.future[0];
  return next
    ? {
        past: [...history.past, history.present],
        present: next,
        future: history.future.slice(1),
      }
    : history;
}

export function reconcilePolling(
  history: History | null,
  saved: EditorDraft | null,
  next: EditorDraft,
  reset = false,
): { history: History; saved: EditorDraft } {
  if (
    !reset &&
    history &&
    saved &&
    Object.keys(changes(history.present, saved)).length > 0
  )
    return { history, saved };
  return {
    history:
      !reset && history && JSON.stringify(next) === JSON.stringify(saved)
        ? history
        : { past: [], present: next, future: [] },
    saved: next,
  };
}
