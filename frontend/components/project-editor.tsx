"use client";
import {
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
  useCallback,
  useId,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Captions,
  Film,
  Type,
  Music,
  Undo2,
  Redo2,
  Save,
  Download,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  RefreshCw,
  LoaderCircle,
  Search,
} from "lucide-react";
import type { PlayerRef } from "@remotion/player";
import { api, API, json, type Project } from "@/lib/api";
import {
  emptySlot,
  projectDraft,
  projectWorkflow,
  changes,
  editHistory,
  moveHistory,
  reconcilePolling,
  type EditorAsset,
  type EditorDraft,
  type EditorSettings,
  type History,
  type TextOverlay,
} from "@/lib/editor";
import {
  ratios,
  layouts,
  templates,
  regions,
  captionDownload,
} from "@/lib/editor-core.mjs";
import { cn } from "@/lib/utils";
import { EditorPreview, type DragChange } from "@/components/editor-preview";
import { Feedback, Blank } from "@/components/feedback";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

function Range({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <Field data-disabled={disabled}>
      <FieldLabel htmlFor={id}>
        {label}
        <span className="ml-auto text-muted-foreground">
          {max === 1 ? `${Math.round(value * 100)}%` : value.toFixed(2)}
        </span>
      </FieldLabel>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="w-full accent-primary"
      />
    </Field>
  );
}
const toolItems = [
  { id: "Captions", icon: Captions },
  { id: "Media", icon: Film },
  { id: "Text", icon: Type },
  { id: "Audio", icon: Music },
] as const;
export function ProjectEditor({ id }: { id: string }) {
  const t = useTranslations("editor"),
    pt = useTranslations("projects"),
    router = useRouter();
  const [project, setProject] = useState<Project | null>(null),
    [assets, setAssets] = useState<EditorAsset[]>([]),
    [history, setHistory] = useState<History | null>(null),
    [saved, setSaved] = useState<EditorDraft | null>(null);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [tool, setTool] = useState("Captions"),
    [search, setSearch] = useState(""),
    [frame, setFrame] = useState(0),
    [duration, setDuration] = useState(0);
  const [sourceTab, setSourceTab] = useState("script"),
    [mobileTab, setMobileTab] = useState("source");
  const [mobile, setMobile] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const playerRef = useRef<PlayerRef | null>(null),
    sourceInput = useRef<HTMLInputElement | null>(null),
    assetInput = useRef<HTMLInputElement | null>(null),
    musicInput = useRef<HTMLInputElement | null>(null);
  const stateRef = useRef({ history, saved, project, assets });
  useLayoutEffect(() => {
    stateRef.current = { history, saved, project, assets };
  }, [history, saved, project, assets]);
  const activeRef = useRef(true),
    prepared = useRef(false),
    loadVersion = useRef(0),
    dragStart = useRef<EditorDraft | null>(null);
  const draft = history?.present;
  const dirty =
    !!draft && !!saved && Object.keys(changes(draft, saved)).length > 0;
  const processing = busy || (!!project && projectWorkflow(project).running);
  const dirtyRef = useRef(dirty);
  useLayoutEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const load = useCallback(
    async (reset = false, reloadAssets = false) => {
      const version = ++loadVersion.current;
      const p = await api<Project>(`/projects/${id}`);
      const before = stateRef.current;
      let a = before.assets;
      if (
        reloadAssets ||
        !before.project ||
        before.project.has_media !== p.has_media ||
        before.project.updated_at !== p.updated_at
      ) {
        try {
          a = await api<EditorAsset[]>(`/projects/${id}/assets`);
        } catch (error) {
          if (activeRef.current) setMessage((error as Error).message);
          a = [];
        }
      }
      if (!activeRef.current || version !== loadVersion.current) return p;
      const current = stateRef.current;
      const next = projectDraft(p, a);
      setProject(p);
      setAssets(a);
      const reconciled = reconcilePolling(
        current.history,
        current.saved,
        next,
        reset,
      );
      setHistory(reconciled.history);
      setSaved(reconciled.saved);
      if (!prepared.current && projectWorkflow(p).autoPrepare) {
        prepared.current = true;
        const preparedProject = await api<Project>(`/projects/${id}/prepare`, {
          method: "POST",
        });
        if (activeRef.current) setProject(preparedProject);
      }
      return p;
    },
    [id],
  );
  useEffect(() => {
    activeRef.current = true;
    void load().catch((e) => setMessage(e.message));
    const timer = setInterval(
      () =>
        void load().catch((e) => {
          if (activeRef.current) setMessage(e.message);
        }),
      3000,
    );
    return () => {
      activeRef.current = false;
      clearInterval(timer);
    };
  }, [load]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const navigate = (e: MouseEvent) => {
      const link = (e.target as Element).closest("a[href]");
      if (
        !dirtyRef.current ||
        !link ||
        link.getAttribute("download") !== null ||
        link.getAttribute("target") === "_blank"
      )
        return;
      const href = link.getAttribute("href")!;
      if (
        href.startsWith(API) ||
        href.startsWith("blob:") ||
        href.startsWith("#")
      )
        return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
        return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(href);
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", navigate, true);
    };
  }, [t]);
  const edit = (update: (d: EditorDraft) => EditorDraft) =>
    setHistory((current) =>
      current ? editHistory(current, update(current.present)) : current,
    );
  const settings = (update: (s: EditorSettings) => EditorSettings) =>
    edit((d) => ({ ...d, editor_settings: update(d.editor_settings) }));
  const save = useCallback(async () => {
    const current = stateRef.current;
    if (!current.history || !current.saved) return;
    const delta = changes(current.history.present, current.saved);
    if (Object.keys(delta).length === 0) return;
    const p = await api<Project>(`/projects/${id}`, {
      method: "PATCH",
      body: json(delta),
    });
    const next = projectDraft(p, current.assets);
    if (activeRef.current) {
      setProject(p);
      setSaved(next);
      setHistory({ past: [], present: next, future: [] });
      stateRef.current = {
        ...current,
        project: p,
        saved: next,
        history: { past: [], present: next, future: [] },
      };
    }
  }, [id]);
  const operation = async (
    action: () => Promise<unknown>,
    reset = true,
    reloadAssets = false,
  ) => {
    setBusy(true);
    setMessage("");
    try {
      await save();
      await action();
      await load(reset, reloadAssets);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const generate = (stage: string) =>
    operation(() =>
      api(`/projects/${id}/generate`, {
        method: "POST",
        body: json({ stage }),
      }),
    );
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!processing) {
          setBusy(true);
          void save()
            .catch((e) => setMessage(e.message))
            .finally(() => setBusy(false));
        }
        return;
      }
      if (
        processing ||
        (e.target as Element).closest("input,textarea,[contenteditable=true]")
      )
        return;
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        setHistory((h) =>
          h ? moveHistory(h, e.shiftKey ? "redo" : "undo") : h,
        );
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [processing, save]);
  const drag: DragChange = (kind, item, x, y, phase) => {
    if (processing) return;
    if (phase === "start") {
      dragStart.current = stateRef.current.history?.present ?? null;
      return;
    }
    const start = dragStart.current;
    if (phase === "end") dragStart.current = null;
    setHistory((h) => {
      if (!h) return h;
      const current = h.present.editor_settings;
      const next = {
        ...h.present,
        editor_settings:
          kind === "slot"
            ? {
                ...current,
                slots: current.slots.map((s, i) =>
                  i === item ? { ...s, x, y } : s,
                ),
              }
            : {
                ...current,
                textOverlays: current.textOverlays.map((o) =>
                  o.id === item ? { ...o, x, y } : o,
                ),
              },
      };
      if (phase === "end") {
        return start
          ? editHistory({ ...h, present: start }, next)
          : editHistory(h, next);
      }
      return { ...h, present: next };
    });
  };
  const upload = (file: File | null, source = false) => {
    if (!file) return;
    if (source && project?.has_media && !confirm(t("replaceSource"))) return;
    void operation(
      async () => {
        const form = new FormData();
        form.append("file", file);
        await api(`/projects/${id}/${source ? "upload" : "assets"}`, {
          method: "POST",
          body: form,
        });
      },
      true,
      true,
    );
  };
  const downloadCaptions = (format: string) => {
    if (!draft) return;
    const url = URL.createObjectURL(
      new Blob([captionDownload(draft.captions, format)], {
        type: "text/plain;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `recap.${format}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (!project || !draft || !history)
    return (
      <div className="p-6">
        <Feedback message={message} />
        <p role="status">{t("loading")}</p>
      </div>
    );
  const s = draft.editor_settings;
  const workflow = projectWorkflow(project);
  const sourceFallback = workflow.sourceFallback;
  const manualSource = project.source === "upload" && !project.has_media;
  const progress = t(workflow.running ? workflow.progress : "working");
  const seek = (ms: number) =>
    playerRef.current?.seekTo(
      Math.min(
        Math.max(0, Math.round((ms / 1000) * 30)),
        Math.max(
          0,
          Math.ceil(
            (project.has_audio
              ? duration
              : (assets.find((a) => a.id === s.slots[0]?.assetId)?.duration ??
                5)) * 30,
          ) - 1,
        ),
      ),
    );
  const updateOverlay = (id: string, update: Partial<TextOverlay>) =>
    settings((s) => ({
      ...s,
      textOverlays: s.textOverlays.map((o) =>
        o.id === id ? { ...o, ...update } : o,
      ),
    }));
  const sourcePanel = (
    <section className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4">
      <Tabs value={sourceTab} onValueChange={setSourceTab}>
        <TabsList>
          <TabsTrigger value="transcript">{t("transcript")}</TabsTrigger>
          <TabsTrigger value="script">{t("script")}</TabsTrigger>
          <TabsTrigger value="captions">{t("captions")}</TabsTrigger>
        </TabsList>
        <TabsContent value="transcript">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="editor-transcript">
                {pt("sourceTranscript")}
              </FieldLabel>
              <Textarea
                id="editor-transcript"
                rows={15}
                value={draft.transcript}
                disabled={processing}
                onChange={(e) =>
                  edit((d) => ({ ...d, transcript: e.target.value }))
                }
              />
            </Field>
            {(manualSource || sourceFallback) && !processing && (
              <>
                <Button
                  variant="outline"
                  onClick={() => sourceInput.current?.click()}
                >
                  <Film data-icon="inline-start" />
                  {pt("uploadSourceFile")}
                </Button>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t("transcriptFallback")}
                </p>
              </>
            )}
          </FieldGroup>
        </TabsContent>
        <TabsContent value="script">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="editor-script">
                {pt("burmeseScript")}
              </FieldLabel>
              <Textarea
                id="editor-script"
                rows={17}
                value={draft.script}
                disabled={processing}
                onChange={(e) =>
                  edit((d) => ({ ...d, script: e.target.value }))
                }
              />
            </Field>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("scriptWarning")}
            </p>
          </FieldGroup>
        </TabsContent>
        <TabsContent value="captions">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="caption-search">
                <Search />
                {t("searchCaptions")}
              </FieldLabel>
              <Input
                id="caption-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </Field>
            {draft.captions.length === 0 ? (
              <Blank
                title={t("noCaptions")}
                description={t("generateNarrationFirst")}
              />
            ) : (
              draft.captions.map((c, i) =>
                c.text
                  .toLocaleLowerCase()
                  .includes(search.toLocaleLowerCase()) ? (
                  <Field
                    key={i}
                    data-invalid={c.endMs <= c.startMs}
                    className={cn(
                      "rounded-lg border p-3",
                      (frame / 30) * 1000 >= c.startMs &&
                        (frame / 30) * 1000 < c.endMs &&
                        "border-primary",
                    )}
                  >
                    <FieldLabel htmlFor={`caption-${i}`}>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => seek(c.startMs)}
                      >
                        {(c.startMs / 1000).toFixed(2)}s
                      </Button>
                    </FieldLabel>
                    <Textarea
                      id={`caption-${i}`}
                      value={c.text}
                      disabled={processing}
                      onChange={(e) =>
                        edit((d) => ({
                          ...d,
                          captions: d.captions.map((item, index) =>
                            index === i
                              ? { ...item, text: e.target.value }
                              : item,
                          ),
                        }))
                      }
                    />
                    <div className="flex gap-2">
                      {(["startMs", "endMs"] as const).map((key) => (
                        <Field key={key}>
                          <FieldLabel htmlFor={`caption-${i}-${key}`}>
                            {t(key)}
                          </FieldLabel>
                          <Input
                            id={`caption-${i}-${key}`}
                            type="number"
                            min={0}
                            step={0.01}
                            value={c[key] / 1000}
                            disabled={processing}
                            aria-invalid={c.endMs <= c.startMs}
                            onChange={(e) =>
                              edit((d) => ({
                                ...d,
                                captions: d.captions.map((item, index) =>
                                  index === i
                                    ? {
                                        ...item,
                                        [key]: Math.round(
                                          Number(e.target.value) * 1000,
                                        ),
                                      }
                                    : item,
                                ),
                              }))
                            }
                          />
                        </Field>
                      ))}
                    </div>
                  </Field>
                ) : null,
              )
            )}
          </FieldGroup>
        </TabsContent>
      </Tabs>
      <div className="mt-auto flex shrink-0 flex-col gap-3">
        <Button disabled={processing} onClick={() => void generate("script")}>
          {pt("1GenerateBurmeseRecap")}
        </Button>
        <Button
          variant="secondary"
          disabled={
            processing ||
            !draft.script.trim() ||
            draft.transcript !== saved?.transcript
          }
          onClick={() => void generate("audio")}
        >
          {pt("2GenerateNarration")}
        </Button>
      </div>
    </section>
  );
  const toolsPanel = (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden">
      <Tabs
        value={tool}
        onValueChange={(value) => setTool(String(value))}
        className="h-full gap-0"
      >
        <TabsList className="rounded-none border-b bg-background p-2">
          {toolItems.map((item) => (
            <TabsTrigger
              key={item.id}
              value={item.id}
              className="px-2"
              aria-label={t(item.id.toLowerCase())}
            >
              <item.icon />
              <span className="sr-only">{t(item.id.toLowerCase())}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="Captions" className="overflow-y-auto p-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="caption-preset">
                {t("captionStyle")}
              </FieldLabel>
              <NativeSelect
                id="caption-preset"
                value={draft.caption_style}
                disabled={processing}
                onChange={(e) =>
                  edit((d) => ({ ...d, caption_style: e.target.value }))
                }
              >
                {templates.map((p) => (
                  <NativeSelectOption key={p} value={p}>
                    {t(p)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Button
              variant="outline"
              disabled={processing}
              onClick={() =>
                settings((s) => ({ ...s, captionsVisible: !s.captionsVisible }))
              }
            >
              {s.captionsVisible ? <Eye /> : <EyeOff />}
              {t("toggleCaptions")}
            </Button>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("segmentTiming")}
            </p>
            <Field>
              <FieldLabel>{t("downloadCaptions")}</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {["txt", "srt", "vtt"].map((format) => (
                  <Button
                    key={format}
                    size="sm"
                    variant="outline"
                    disabled={!draft.captions.length}
                    onClick={() => downloadCaptions(format)}
                  >
                    {format.toUpperCase()}
                  </Button>
                ))}
              </div>
            </Field>
          </FieldGroup>
        </TabsContent>
        <TabsContent value="Media" className="overflow-y-auto p-4">
          <FieldGroup>
            <Button
              disabled={processing}
              variant="outline"
              onClick={() => assetInput.current?.click()}
            >
              <Plus />
              {t("addMedia")}
            </Button>
            {(project.has_media || manualSource || sourceFallback) &&
              !processing && (
                <Button
                  variant="outline"
                  onClick={() => sourceInput.current?.click()}
                >
                  {t(project.has_media ? "replaceSourceButton" : "uploadVideo")}
                </Button>
              )}
            <Button
              disabled={processing}
              variant="ghost"
              onClick={() =>
                settings((s) => ({ ...s, videoVisible: !s.videoVisible }))
              }
            >
              {s.videoVisible ? <Eye /> : <EyeOff />}
              {t("toggleVideo")}
            </Button>
            {assets
              .filter((a) => a.kind === "video")
              .map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-2 rounded-lg border p-2"
                >
                  <Film className="size-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{a.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.width}×{a.height} · {a.duration.toFixed(1)}s
                    </p>
                  </div>
                  {a.id !== "source" && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t("removeMedia")}
                      disabled={processing}
                      onClick={() =>
                        void operation(
                          () =>
                            api(`/projects/${id}/assets/${a.id}`, {
                              method: "DELETE",
                            }),
                          true,
                          true,
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              ))}
            {s.slots.map((slot, i) => (
              <FieldGroup key={i} className="rounded-lg border p-3">
                <Field>
                  <FieldLabel htmlFor={`slot-${i}`}>
                    {t("slot", { count: i + 1 })}
                  </FieldLabel>
                  <NativeSelect
                    id={`slot-${i}`}
                    value={slot.assetId ?? ""}
                    disabled={processing}
                    onChange={(e) =>
                      settings((s) => ({
                        ...s,
                        slots: s.slots.map((item, index) =>
                          index === i
                            ? emptySlot(e.target.value || null, item.mode)
                            : item,
                        ),
                      }))
                    }
                  >
                    <NativeSelectOption value="">
                      {t("emptySlot")}
                    </NativeSelectOption>
                    {assets
                      .filter((a) => a.kind === "video")
                      .map((a) => (
                        <NativeSelectOption key={a.id} value={a.id}>
                          {a.name}
                        </NativeSelectOption>
                      ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`fit-${i}`}>{t("fitMode")}</FieldLabel>
                  <NativeSelect
                    id={`fit-${i}`}
                    value={slot.mode}
                    disabled={processing}
                    onChange={(e) =>
                      settings((s) => ({
                        ...s,
                        slots: s.slots.map((item, index) =>
                          index === i
                            ? {
                                ...item,
                                mode: e.target.value as "fit" | "fill",
                                scale: 1,
                                x: 0.5,
                                y: 0.5,
                              }
                            : item,
                        ),
                      }))
                    }
                  >
                    <NativeSelectOption value="fit">
                      {t("fit")}
                    </NativeSelectOption>
                    <NativeSelectOption value="fill">
                      {t("fill")}
                    </NativeSelectOption>
                  </NativeSelect>
                </Field>
                <Range
                  label={t("zoom")}
                  min={0.25}
                  max={4}
                  value={slot.scale}
                  disabled={processing}
                  onChange={(scale) =>
                    settings((s) => ({
                      ...s,
                      slots: s.slots.map((item, index) =>
                        index === i ? { ...item, scale } : item,
                      ),
                    }))
                  }
                />
                <Button
                  variant="ghost"
                  disabled={processing}
                  onClick={() =>
                    settings((s) => ({
                      ...s,
                      slots: s.slots.map((item, index) =>
                        index === i
                          ? { ...item, visible: !item.visible }
                          : item,
                      ),
                    }))
                  }
                >
                  {slot.visible ? <Eye /> : <EyeOff />}
                  {t("toggleSlot")}
                </Button>
              </FieldGroup>
            ))}
            <p className="text-xs text-muted-foreground">{t("dragMedia")}</p>
          </FieldGroup>
        </TabsContent>
        <TabsContent value="Text" className="overflow-y-auto p-4">
          <FieldGroup>
            <Button
              disabled={processing || s.textOverlays.length >= 30}
              variant="outline"
              onClick={() =>
                settings((s) => ({
                  ...s,
                  textOverlays: [
                    ...s.textOverlays,
                    {
                      id: crypto.randomUUID(),
                      text: t("newText"),
                      x: 0.5,
                      y: 0.22,
                      fontSize: 36,
                      color: "#ffffff",
                      bold: true,
                      background: true,
                      align: "center",
                      visible: true,
                    },
                  ],
                }))
              }
            >
              <Plus />
              {t("addText")}
            </Button>
            {s.textOverlays.map((o) => (
              <FieldGroup key={o.id} className="rounded-lg border p-3">
                <Field>
                  <FieldLabel htmlFor={`text-${o.id}`}>{t("text")}</FieldLabel>
                  <Textarea
                    id={`text-${o.id}`}
                    value={o.text}
                    disabled={processing}
                    onChange={(e) =>
                      updateOverlay(o.id, { text: e.target.value })
                    }
                  />
                </Field>
                <Range
                  label={t("fontSize")}
                  min={22}
                  max={120}
                  step={1}
                  value={o.fontSize}
                  disabled={processing}
                  onChange={(fontSize) => updateOverlay(o.id, { fontSize })}
                />
                <Field>
                  <FieldLabel htmlFor={`color-${o.id}`}>
                    {t("color")}
                  </FieldLabel>
                  <Input
                    id={`color-${o.id}`}
                    type="color"
                    value={o.color}
                    disabled={processing}
                    onChange={(e) =>
                      updateOverlay(o.id, { color: e.target.value })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`align-${o.id}`}>
                    {t("alignment")}
                  </FieldLabel>
                  <NativeSelect
                    id={`align-${o.id}`}
                    value={o.align}
                    disabled={processing}
                    onChange={(e) =>
                      updateOverlay(o.id, {
                        align: e.target.value as TextOverlay["align"],
                      })
                    }
                  >
                    {["left", "center", "right"].map((a) => (
                      <NativeSelectOption key={a} value={a}>
                        {t(a)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={o.bold ? "secondary" : "outline"}
                    aria-pressed={o.bold}
                    disabled={processing}
                    onClick={() => updateOverlay(o.id, { bold: !o.bold })}
                  >
                    {t("bold")}
                  </Button>
                  <Button
                    variant={o.background ? "secondary" : "outline"}
                    aria-pressed={o.background}
                    disabled={processing}
                    onClick={() =>
                      updateOverlay(o.id, { background: !o.background })
                    }
                  >
                    {t("box")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("toggleText")}
                    disabled={processing}
                    onClick={() => updateOverlay(o.id, { visible: !o.visible })}
                  >
                    {o.visible ? <Eye /> : <EyeOff />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("removeText")}
                    disabled={processing}
                    onClick={() =>
                      settings((s) => ({
                        ...s,
                        textOverlays: s.textOverlays.filter(
                          (item) => item.id !== o.id,
                        ),
                      }))
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              </FieldGroup>
            ))}
            <p className="text-xs text-muted-foreground">{t("dragText")}</p>
          </FieldGroup>
        </TabsContent>
        <TabsContent value="Audio" className="overflow-y-auto p-4">
          <FieldGroup>
            <Range
              label={t("narrationVolume")}
              value={s.audio.narrationVolume}
              disabled={processing}
              onChange={(narrationVolume) =>
                settings((s) => ({
                  ...s,
                  audio: { ...s.audio, narrationVolume },
                }))
              }
            />
            <Range
              label={t("sourceVolume")}
              value={s.audio.sourceVolume}
              disabled={processing}
              onChange={(sourceVolume) =>
                settings((s) => ({ ...s, audio: { ...s.audio, sourceVolume } }))
              }
            />
            <Button
              variant="outline"
              disabled={processing}
              aria-pressed={s.audio.sourceMuted}
              onClick={() =>
                settings((s) => ({
                  ...s,
                  audio: { ...s.audio, sourceMuted: !s.audio.sourceMuted },
                }))
              }
            >
              {t(s.audio.sourceMuted ? "unmuteSource" : "muteSource")}
            </Button>
            <Button
              variant="outline"
              disabled={processing}
              onClick={() => musicInput.current?.click()}
            >
              <Plus />
              {t("addMusic")}
            </Button>
            <Field>
              <FieldLabel htmlFor="music-asset">{t("music")}</FieldLabel>
              <NativeSelect
                id="music-asset"
                value={s.audio.musicAssetId ?? ""}
                disabled={processing}
                onChange={(e) =>
                  settings((s) => ({
                    ...s,
                    audio: { ...s.audio, musicAssetId: e.target.value || null },
                  }))
                }
              >
                <NativeSelectOption value="">{t("noMusic")}</NativeSelectOption>
                {assets
                  .filter((a) => a.kind === "audio" && a.id !== "source")
                  .map((a) => (
                    <NativeSelectOption key={a.id} value={a.id}>
                      {a.name}
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
            </Field>
            <Range
              label={t("musicVolume")}
              value={s.audio.musicVolume}
              disabled={processing}
              onChange={(musicVolume) =>
                settings((s) => ({ ...s, audio: { ...s.audio, musicVolume } }))
              }
            />
            {assets
              .filter((a) => a.kind === "audio" && a.id !== "source")
              .map((a) => (
                <div key={a.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {a.name}
                  </span>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={processing}
                    aria-label={t("removeMedia")}
                    onClick={() =>
                      void operation(
                        () =>
                          api(`/projects/${id}/assets/${a.id}`, {
                            method: "DELETE",
                          }),
                        true,
                        true,
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
          </FieldGroup>
        </TabsContent>
      </Tabs>
    </aside>
  );
  const previewPanel = (
    <section className="flex h-full min-h-0 flex-col bg-muted/30">
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-3 border-b bg-background p-3">
        <NativeSelect
          aria-label={t("aspectRatio")}
          value={s.aspectRatio}
          disabled={processing}
          onChange={(e) =>
            settings((s) => ({
              ...s,
              aspectRatio: e.target.value as EditorSettings["aspectRatio"],
            }))
          }
        >
          {Object.keys(ratios).map((r) => (
            <NativeSelectOption key={r} value={r}>
              {r}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label={t("layout")}
          value={s.layout}
          disabled={processing}
          onChange={(e) =>
            settings((s) => {
              const [w, h] = ratios[s.aspectRatio],
                layout = e.target.value,
                count = regions(layout, w, h).length;
              return {
                ...s,
                layout,
                slots: Array.from({ length: count }, (_, i) =>
                  s.slots[i]
                    ? {
                        ...s.slots[i],
                        mode:
                          i === 0 && ["fill", "fit"].includes(layout)
                            ? (layout as "fill" | "fit")
                            : s.slots[i].mode,
                      }
                    : emptySlot(),
                ),
              };
            })
          }
        >
          {layouts.map((l) => (
            <NativeSelectOption key={l} value={l}>
              {t(l)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <EditorPreview
        draft={draft}
        assets={assets}
        projectId={project.id}
        revision={project.updated_at}
        hasAudio={project.has_audio}
        narrationDuration={
          duration || (draft.captions.at(-1)?.endMs ?? 5000) / 1000
        }
        tool={tool}
        disabled={processing}
        onDrag={drag}
        playerRef={playerRef}
        onFrame={setFrame}
        labels={{ moveVideo: t("moveVideo"), moveText: t("moveText") }}
        onError={(e) => setMessage(e.message)}
      />
      {!assets.some((a) => a.kind === "video") && (
        <div className="shrink-0 p-4">
          <Blank
            title={processing ? progress : t("noVideo")}
            description={
              processing
                ? t("recapProgressDescription")
                : project.transcript || project.script
                  ? t("transcriptOnlyPreview")
                  : sourceFallback || manualSource
                    ? t("transcriptFallback")
                    : t("selectedVideoAutomatic")
            }
          />
        </div>
      )}
    </section>
  );
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b p-3">
        <Link
          href="/projects"
          aria-label={t("back")}
          className={buttonVariants({ variant: "ghost", size: "icon" })}
        >
          <ArrowLeft />
        </Link>
        <Input
          aria-label={t("projectName")}
          value={draft.title}
          disabled={processing}
          className="min-w-24 flex-1 md:max-w-80"
          onChange={(e) => edit((d) => ({ ...d, title: e.target.value }))}
        />
        <Badge variant="secondary">
          {workflow.running
            ? progress
            : pt.has(project.status)
              ? pt(project.status)
              : t("status", { status: project.status })}
        </Badge>
        <span role="status" className="text-xs text-muted-foreground">
          {t(dirty ? "unsaved" : "saved")}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label={t("undo")}
            disabled={processing || !history.past.length}
            onClick={() => setHistory((h) => (h ? moveHistory(h, "undo") : h))}
          >
            <Undo2 />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={t("redo")}
            disabled={processing || !history.future.length}
            onClick={() => setHistory((h) => (h ? moveHistory(h, "redo") : h))}
          >
            <Redo2 />
          </Button>
          <Button
            variant="outline"
            disabled={processing || !dirty}
            onClick={() => void operation(async () => {}, false)}
          >
            <Save />
            {t("save")}
          </Button>
          <Button
            disabled={
              processing ||
              !project.has_audio ||
              draft.script !== saved?.script ||
              draft.transcript !== saved?.transcript
            }
            onClick={() => void generate("video")}
          >
            <Download />
            {t("export")}
          </Button>
        </div>
      </header>
      <Sheet
        open={pendingHref !== null}
        onOpenChange={(open) => {
          if (!open) setPendingHref(null);
        }}
      >
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>{t("unsaved")}</SheetTitle>
            <SheetDescription>{t("leaveUnsaved")}</SheetDescription>
          </SheetHeader>
          <SheetFooter>
            <Button onClick={() => setPendingHref(null)}>{t("stay")}</Button>
            <Button
              variant="outline"
              onClick={() => {
                const href = pendingHref;
                setPendingHref(null);
                dirtyRef.current = false;
                if (href) {
                  const url = new URL(href, location.href);
                  if (url.origin === location.origin)
                    router.push(url.pathname + url.search + url.hash);
                  else location.assign(url.href);
                }
              }}
            >
              {t("discardAndLeave")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <Feedback message={message || project.error || ""} />
      {(processing || project.error) && (
        <div
          role="status"
          className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-muted px-4 py-2 text-sm"
        >
          {processing ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              {progress}
            </>
          ) : (
            <>
              <span className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
                {project.error}
              </span>
              {["prepare", "script", "audio", "video"].includes(
                project.stage ?? "",
              ) && (
                <Button
                  variant="outline"
                  onClick={() =>
                    project.stage === "prepare"
                      ? void operation(() =>
                          api(`/projects/${id}/prepare`, { method: "POST" }),
                        )
                      : void generate(project.stage!)
                  }
                >
                  <RefreshCw data-icon="inline-start" />
                  {t("retry")}
                </Button>
              )}
              {sourceFallback && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => sourceInput.current?.click()}
                  >
                    {t("uploadVideo")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSourceTab("transcript");
                      setMobileTab("source");
                    }}
                  >
                    {t("pasteTranscript")}
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1">
        {mobile ? (
          <Tabs
            value={mobileTab}
            onValueChange={setMobileTab}
            className="h-full gap-0"
          >
            <TabsList className="rounded-none">
              <TabsTrigger value="source">{t("script")}</TabsTrigger>
              <TabsTrigger value="preview">{t("preview")}</TabsTrigger>
              <TabsTrigger value="tools">{t("tools")}</TabsTrigger>
            </TabsList>
            <TabsContent value="source">{sourcePanel}</TabsContent>
            <TabsContent value="preview">{previewPanel}</TabsContent>
            <TabsContent value="tools">{toolsPanel}</TabsContent>
          </Tabs>
        ) : (
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel defaultSize="30%" minSize="20%">
              {sourcePanel}
            </ResizablePanel>
            <ResizableHandle aria-label={t("resizeTranscript")} withHandle />
            <ResizablePanel defaultSize="45%" minSize="25%">
              {previewPanel}
            </ResizablePanel>
            <ResizableHandle aria-label={t("resizeTools")} withHandle />
            <ResizablePanel defaultSize="25%" minSize="20%">
              {toolsPanel}
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t px-4 py-2">
        <span className="mr-auto text-xs text-muted-foreground">
          {t("manualGeneration")}
        </span>
        {project.script && (
          <a
            href={`${API}/projects/${id}/download/script`}
            download
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            {t("downloadScript")}
          </a>
        )}
        {project.has_audio && (
          <a
            href={`${API}/projects/${id}/download/audio`}
            download
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            MP3
          </a>
        )}
        {project.has_video && !dirty && (
          <a
            href={`${API}/projects/${id}/download/video`}
            download
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Download />
            MP4
          </a>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("deleteProject")}
          disabled={processing}
          onClick={() => {
            if (!confirm(pt("deleteThisProjectAndItsFiles"))) return;
            setBusy(true);
            void api(`/projects/${id}`, { method: "DELETE" })
              .then(() => {
                dirtyRef.current = false;
                router.push("/projects");
              })
              .catch((e) => {
                setMessage(e.message);
                setBusy(false);
              });
          }}
        >
          <Trash2 />
        </Button>
      </footer>
      <input
        ref={sourceInput}
        type="file"
        className="sr-only"
        accept="video/mp4,video/quicktime,video/webm,audio/mpeg,audio/wav,audio/mp4,audio/ogg"
        onChange={(e) => {
          upload(e.target.files?.[0] ?? null, true);
          e.target.value = "";
        }}
      />
      <input
        ref={assetInput}
        type="file"
        className="sr-only"
        accept="video/mp4,video/quicktime,video/webm"
        onChange={(e) => {
          upload(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      <input
        ref={musicInput}
        type="file"
        className="sr-only"
        accept="audio/mpeg,audio/wav,audio/mp4,audio/ogg"
        onChange={(e) => {
          upload(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      {project.has_audio && (
        <audio
          key={project.updated_at ?? project.status}
          src={`${API}/projects/${id}/download/audio?v=${project.updated_at}`}
          preload="metadata"
          className="hidden"
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        />
      )}
    </div>
  );
}
