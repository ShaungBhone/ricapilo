"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Bot,
  FileText,
  SlidersHorizontal,
  MessageSquare,
  PanelLeft,
  MoreHorizontal,
  LoaderCircle,
} from "lucide-react";
import { AssistantSplit } from "./assistant-split";
import { api, json, type Assistant, type Model } from "@/lib/api";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
} from "@/components/ui/select";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Feedback } from "@/components/feedback";
import {
  AssistantConfirmation,
  AssistantError,
  AssistantSkeleton,
  AssistantStatus,
} from "./shared";

type Draft = Omit<Assistant, "id">;
type Section = "overview" | "allSettings" | "modelsVoice" | "messages";
const sections = [
  { key: "overview", icon: FileText },
  { key: "allSettings", icon: SlidersHorizontal },
  { key: "modelsVoice", icon: Bot },
  { key: "messages", icon: MessageSquare },
] as const;
const initial: Draft = {
  name: "",
  instructions: "မြန်မာဘာသာဖြင့် ရှင်းလင်းပြီး သဘာဝကျစွာ ပြောဆိုပါ။",
  first_message: "မင်္ဂလာပါ။ ဘာကူညီပေးရမလဲ။",
  llm_model: "",
  stt_model: "",
  tts_model: "",
  voice: "",
  silence_ms: 1200,
  enabled: true,
};
function toDraft(a: Assistant): Draft {
  return {
    name: a.name,
    instructions: a.instructions,
    first_message: a.first_message ?? "",
    llm_model: a.llm_model,
    stt_model: a.stt_model,
    tts_model: a.tts_model,
    voice: a.voice,
    silence_ms: a.silence_ms,
    enabled: a.enabled,
  };
}

const RECOMMENDED_TEXT_PATTERNS = [
  /^openai\/(gpt-4o|gpt-4-turbo|chatgpt-4o|o1|o3)/i,
  /^google\/gemini/i,
  /^anthropic\/claude-3/i,
  /^meta-llama\/llama-3/i,
  /^qwen\/qwen-2\.5/i,
  /^deepseek\/deepseek/i,
  /^test\//i,
];

function isRecommendedModel(model: Model, currentSelectedId?: string): boolean {
  if (currentSelectedId && model.id === currentSelectedId) {
    return true;
  }
  if (model.kind === "transcription" || model.kind === "speech") {
    return true;
  }
  return RECOMMENDED_TEXT_PATTERNS.some((pattern) => pattern.test(model.id));
}

function getProviderLabel(modelId: string): string {
  const parts = modelId.split("/");
  if (parts.length < 2) return "Other";
  const raw = parts[0].toLowerCase();
  const knownProviders: Record<string, string> = {
    openai: "OpenAI",
    google: "Google",
    anthropic: "Anthropic",
    "meta-llama": "Meta",
    meta: "Meta",
    deepseek: "DeepSeek",
    qwen: "Qwen",
    mistralai: "Mistral",
    microsoft: "Microsoft",
    cohere: "Cohere",
    elevenlabs: "ElevenLabs",
    amazon: "Amazon",
    xai: "xAI",
  };
  if (knownProviders[raw]) return knownProviders[raw];
  return raw
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function groupModelsByProvider(
  options: Model[],
): { provider: string; models: Model[] }[] {
  const groups = new Map<string, Model[]>();
  for (const m of options) {
    const provider = getProviderLabel(m.id);
    const existing = groups.get(provider);
    if (existing) {
      existing.push(m);
    } else {
      groups.set(provider, [m]);
    }
  }

  const priority = [
    "OpenAI",
    "Google",
    "Anthropic",
    "Meta",
    "DeepSeek",
    "Qwen",
  ];
  return Array.from(groups.entries())
    .map(([provider, models]) => ({
      provider,
      models: [...models].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      const idxA = priority.indexOf(a.provider);
      const idxB = priority.indexOf(b.provider);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.provider.localeCompare(b.provider);
    });
}

export function AssistantEditor({ assistantId }: { assistantId: string }) {
  const t = useTranslations();
  const router = useRouter();
  const isNew = assistantId === "new";
  const [draft, setDraft] = useState<Draft>(initial);
  const [showAllModels, setShowAllModels] = useState(false);
  const [baseline, setBaseline] = useState<Draft>(initial);
  const [saved, setSaved] = useState<Assistant | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [section, setSection] = useState<Section>("overview");
  const [navOpen, setNavOpen] = useState(false);
  const [destination, setDestination] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [audio, setAudio] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const dirtyRef = useRef(dirty);
  const editLocation = useRef<{ url: string; state: unknown } | null>(null);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  const formRef = useRef<HTMLFormElement>(null);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const [available, list] = await Promise.all([
          api<Model[]>("/models", { signal }),
          isNew
            ? Promise.resolve([])
            : api<Assistant[]>("/assistants", { signal }),
        ]);
        if (signal?.aborted) return;
        setModels(available);
        const a = list.find((item) => String(item.id) === assistantId);
        if (!isNew && !a) {
          setMissing(true);
          return;
        }
        const value = a ? toDraft(a) : { ...initial };
        setSaved(a ?? null);
        setDraft(value);
        setBaseline(value);
      } catch (e) {
        if (!signal?.aborted) setLoadError((e as Error).message);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [assistantId, isNew],
  );
  useEffect(() => {
    const abort = new AbortController();
    queueMicrotask(() => {
      if (!abort.signal.aborted) void load(abort.signal);
    });
    return () => abort.abort();
  }, [load]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const click = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>(
        "a[href]",
      );
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      )
        return;
      const next = new URL(anchor.href, location.href);
      if (
        next.origin === location.origin &&
        next.pathname === location.pathname &&
        next.search === location.search
      )
        return;
      if (dirtyRef.current) {
        event.preventDefault();
        event.stopPropagation();
        setDestination(anchor.href);
      }
    };
    // Capture browser back/forward before Next handles the route change.
    const pop = (event: PopStateEvent) => {
      if (dirtyRef.current && editLocation.current) {
        const nextUrl = location.href;
        event.stopImmediatePropagation();
        history.pushState(
          editLocation.current.state,
          "",
          editLocation.current.url,
        );
        setDestination(nextUrl);
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    window.addEventListener("popstate", pop, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
      window.removeEventListener("popstate", pop, true);
    };
  }, []);
  function navigate(url: string) {
    if (dirtyRef.current) setDestination(url);
    else router.push(url);
  }
  function leave() {
    if (!destination) return;
    dirtyRef.current = false;
    const next = new URL(destination, location.href);
    if (next.origin === location.origin)
      router.push(next.pathname + next.search + next.hash);
    else location.assign(next.href);
    setDestination(null);
  }
  function change<K extends keyof Draft>(key: K, value: Draft[K]) {
    const next = { ...draft, [key]: value };
    editLocation.current = { url: location.href, state: history.state };
    dirtyRef.current = JSON.stringify(next) !== JSON.stringify(baseline);
    setDraft(next);
    setNotice("");
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    if (!formRef.current?.checkValidity()) {
      setSection("allSettings");
      requestAnimationFrame(() => formRef.current?.reportValidity());
      return;
    }
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<Assistant>(
        isNew ? "/assistants" : `/assistants/${assistantId}`,
        { method: isNew ? "POST" : "PUT", body: json(draft) },
      );
      const value = toDraft(result);
      dirtyRef.current = false;
      setSaved(result);
      setDraft(value);
      setBaseline(value);
      setAudio(null);
      setNotice(t("assistants.assistantSaved"));
      if (isNew) router.replace(`/assistants/${result.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function action(kind: "preview" | "delete") {
    if (!saved || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      if (kind === "delete") {
        await api(`/assistants/${saved.id}`, { method: "DELETE" });
        dirtyRef.current = false;
        router.push("/assistants");
      } else {
        const result = await api<{ audio: string }>(
          `/assistants/${saved.id}/preview`,
          { method: "POST" },
        );
        setAudio("data:audio/mpeg;base64," + result.audio);
      }
    } catch (e) {
      setError((e as Error).message);
      if (kind === "delete") setDeleteOpen(false);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  const nav = (
    <nav
      aria-label={t("assistants.settings")}
      className="flex flex-col gap-1 p-3"
    >
      {sections.map(({ key, icon: Icon }) => (
        <Button
          key={key}
          variant={section === key ? "secondary" : "ghost"}
          className="w-full justify-start"
          aria-current={section === key ? "true" : undefined}
          onClick={() => {
            setSection(key);
            setNavOpen(false);
          }}
        >
          <Icon data-icon="inline-start" />
          {t(`assistants.${key}`)}
        </Button>
      ))}
    </nav>
  );
  if (loading) return <AssistantSkeleton />;
  if (loadError || missing)
    return (
      <div className="flex flex-col items-start gap-4 p-6">
        <Link
          href="/assistants"
          className={buttonVariants({ variant: "outline" })}
        >
          <ArrowLeft data-icon="inline-start" />
          {t("assistants.backToList")}
        </Link>
        <AssistantError
          message={missing ? t("assistants.notFound") : loadError}
          retry={
            missing
              ? undefined
              : () => {
                  setLoading(true);
                  setLoadError("");
                  void load();
                }
          }
        />
      </div>
    );
  const voices =
    models.find((m) => m.kind === "speech" && m.id === draft.tts_model)
      ?.voices ?? [];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <AssistantConfirmation
        open={destination !== null}
        onOpenChange={(open) => {
          if (!open) setDestination(null);
        }}
        title={t("assistants.unsaved")}
        description={t("assistants.discardChanges")}
        onConfirm={leave}
      />
      <AssistantConfirmation
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("assistants.delete")}
        description={t("assistants.deleteThisAssistant")}
        busy={busy}
        onConfirm={() => void action("delete")}
      />
      <Feedback message={notice} />
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("assistants.backToList")}
            onClick={() => navigate("/assistants")}
          >
            <ArrowLeft />
          </Button>
          <div className="flex min-w-0 flex-col gap-1">
            <Link
              href="/assistants"
              className="text-xs text-muted-foreground hover:underline"
            >
              {t("workspace.assistants")}
            </Link>
            <h1 className="max-w-72 truncate font-semibold">
              {draft.name ||
                t(
                  isNew
                    ? "assistants.newAssistant"
                    : "assistants.editAssistant",
                )}
            </h1>
          </div>
          <AssistantStatus enabled={draft.enabled} />
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="hidden text-xs text-muted-foreground sm:block">
              {t("assistants.unsaved")}
            </span>
          )}
          <Button
            type="submit"
            form="assistant-form"
            disabled={busy || (!isNew && !dirty)}
          >
            {busy && (
              <LoaderCircle data-icon="inline-start" className="animate-spin" />
            )}
            {t(isNew ? "assistants.createAssistant" : "administration.save")}
          </Button>
          {saved && (
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={busy}
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("assistants.actions")}
                  />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={!saved.enabled}
                    onClick={() => navigate(`/talk?assistant=${saved.id}`)}
                  >
                    {t("assistants.talk")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!saved.enabled || busy || dirty}
                    onClick={() => void action("preview")}
                  >
                    {t("assistants.previewVoice")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={busy}
                    onClick={() => setDeleteOpen(true)}
                  >
                    {t("assistants.delete")}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>
      <AssistantSplit navigation={nav}>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="shrink-0 border-b p-3 md:hidden">
            <Sheet open={navOpen} onOpenChange={setNavOpen}>
              <SheetTrigger render={<Button variant="outline" size="sm" />}>
                <PanelLeft data-icon="inline-start" />
                {t(`assistants.${section}`)}
              </SheetTrigger>
              <SheetContent side="left">
                <SheetHeader>
                  <SheetTitle>{t("assistants.settings")}</SheetTitle>
                </SheetHeader>
                {nav}
              </SheetContent>
            </Sheet>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
            <div className="mx-auto flex max-w-3xl flex-col gap-6">
              {error && <AssistantError message={error} />}
              {audio && (
                <audio
                  key={audio}
                  aria-label={t("assistants.previewVoice")}
                  controls
                  autoPlay
                  src={audio}
                  className="w-full"
                />
              )}
              <form
                id="assistant-form"
                ref={formRef}
                noValidate
                onSubmit={save}
                className="flex flex-col gap-6"
              >
                <fieldset
                  disabled={busy}
                  className="flex min-w-0 flex-col gap-6"
                >
                  <div
                    hidden={section !== "overview" && section !== "allSettings"}
                  >
                    <Card>
                      <CardHeader>
                        <CardTitle>{t("assistants.overview")}</CardTitle>
                        <CardDescription>
                          {t("assistants.overviewDescription")}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <FieldGroup>
                          <Field>
                            <FieldLabel htmlFor="assistant-name">
                              {t("authentication.name")}
                            </FieldLabel>
                            <Input
                              id="assistant-name"
                              required
                              maxLength={100}
                              pattern=".*\S.*"
                              value={draft.name}
                              onChange={(e) => change("name", e.target.value)}
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="assistant-instructions">
                              {t("assistants.assistantInstructions")}
                            </FieldLabel>
                            <Textarea
                              id="assistant-instructions"
                              required
                              maxLength={10000}
                              rows={8}
                              value={draft.instructions}
                              onChange={(e) =>
                                change("instructions", e.target.value)
                              }
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="assistant-enabled">
                              {t("assistants.usage")}
                            </FieldLabel>
                            <NativeSelect
                              id="assistant-enabled"
                              value={String(draft.enabled)}
                              onChange={(e) =>
                                change("enabled", e.target.value === "true")
                              }
                            >
                              <NativeSelectOption value="true">
                                {t("assistants.enable")}
                              </NativeSelectOption>
                              <NativeSelectOption value="false">
                                {t("assistants.disable")}
                              </NativeSelectOption>
                            </NativeSelect>
                          </Field>
                        </FieldGroup>
                      </CardContent>
                    </Card>
                  </div>
                  <div
                    hidden={
                      section !== "modelsVoice" && section !== "allSettings"
                    }
                  >
                    <Card>
                      <CardHeader>
                        <CardTitle>{t("assistants.modelsVoice")}</CardTitle>
                        <CardDescription>
                          {showAllModels
                            ? t("assistants.showingAllModels")
                            : t("assistants.showingRecommendedModels")}
                        </CardDescription>
                        <CardAction>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowAllModels((v) => !v)}
                          >
                            <SlidersHorizontal className="size-3.5" />
                            {showAllModels
                              ? t("assistants.showRecommendedOnly")
                              : t("assistants.showAllModels")}
                          </Button>
                        </CardAction>
                      </CardHeader>
                      <CardContent>
                        <FieldGroup>
                          {(
                            [
                              {
                                key: "llm_model",
                                kind: "text",
                                label: "shared.aiModel",
                              },
                              {
                                key: "stt_model",
                                kind: "transcription",
                                label: "assistants.transcriptionModel",
                              },
                              {
                                key: "tts_model",
                                kind: "speech",
                                label: "assistants.speechModel",
                              },
                            ] as const
                          ).map(({ key, kind, label }) => {
                            const available = models.filter(
                              (m) => m.kind === kind,
                            );
                            let options = showAllModels
                              ? available
                              : available.filter((m) =>
                                  isRecommendedModel(m, draft[key]),
                                );
                            if (options.length === 0 && available.length > 0) {
                              options = available;
                            }
                            const unavailable =
                              draft[key] &&
                              !available.some((m) => m.id === draft[key]);
                            const groupedOptions =
                              groupModelsByProvider(options);
                            return (
                              <Field key={key}>
                                <FieldLabel htmlFor={key}>
                                  {t(label)}
                                </FieldLabel>
                                <Select
                                  name={key}
                                  required
                                  value={draft[key] || undefined}
                                  onValueChange={(value) =>
                                    change(key, value ?? "")
                                  }
                                >
                                  <SelectTrigger id={key} className="w-full">
                                    <SelectValue
                                      placeholder={t("assistants.chooseAModel")}
                                    >
                                      {(value: string | null) =>
                                        value
                                          ? (models.find((m) => m.id === value)
                                              ?.name ?? value)
                                          : t("assistants.chooseAModel")
                                      }
                                    </SelectValue>
                                  </SelectTrigger>
                                  <SelectContent>
                                    {unavailable && (
                                      <SelectItem value={draft[key]}>
                                        {t("assistants.unavailableModel", {
                                          model: draft[key],
                                        })}
                                      </SelectItem>
                                    )}
                                    {groupedOptions.map((group) => (
                                      <SelectGroup key={group.provider}>
                                        <SelectLabel>
                                          {group.provider}
                                        </SelectLabel>
                                        {group.models.map((m) => (
                                          <SelectItem key={m.id} value={m.id}>
                                            {m.name}
                                          </SelectItem>
                                        ))}
                                      </SelectGroup>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </Field>
                            );
                          })}
                          <Field>
                            <FieldLabel htmlFor="assistant-voice">
                              {t("assistants.voiceId")}
                            </FieldLabel>
                            <Input
                              id="assistant-voice"
                              required
                              pattern=".*\S.*"
                              maxLength={150}
                              list="assistant-voices"
                              value={draft.voice}
                              onChange={(e) => change("voice", e.target.value)}
                            />
                            <datalist id="assistant-voices">
                              {voices.map((v) => (
                                <option
                                  key={typeof v === "string" ? v : v.id}
                                  value={typeof v === "string" ? v : v.id}
                                >
                                  {typeof v === "string" ? v : (v.name ?? v.id)}
                                </option>
                              ))}
                            </datalist>
                          </Field>
                        </FieldGroup>
                      </CardContent>
                    </Card>
                  </div>
                  <div
                    hidden={section !== "messages" && section !== "allSettings"}
                  >
                    <Card>
                      <CardHeader>
                        <CardTitle>{t("assistants.messages")}</CardTitle>
                        <CardDescription>
                          {t("assistants.messagesDescription")}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <FieldGroup>
                          <Field>
                            <FieldLabel htmlFor="assistant-greeting">
                              {t("assistants.firstGreeting")}
                            </FieldLabel>
                            <Textarea
                              id="assistant-greeting"
                              maxLength={1000}
                              rows={3}
                              value={draft.first_message}
                              onChange={(e) =>
                                change("first_message", e.target.value)
                              }
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="assistant-silence">
                              {t("assistants.silenceDelayAfterSpeakingMs")}
                            </FieldLabel>
                            <Input
                              id="assistant-silence"
                              type="number"
                              required
                              min={500}
                              max={3000}
                              step={1}
                              value={
                                Number.isNaN(draft.silence_ms)
                                  ? ""
                                  : draft.silence_ms
                              }
                              onChange={(e) =>
                                change("silence_ms", e.target.valueAsNumber)
                              }
                            />
                          </Field>
                        </FieldGroup>
                      </CardContent>
                    </Card>
                  </div>
                </fieldset>
              </form>
            </div>
          </div>
        </div>
      </AssistantSplit>
    </div>
  );
}
