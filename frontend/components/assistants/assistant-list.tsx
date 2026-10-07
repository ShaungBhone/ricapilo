"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Bot, Filter, Plus, Search } from "lucide-react";
import { AssistantTable } from "./assistant-table";
import { AssistantSplit } from "./assistant-split";
import { api, type Assistant } from "@/lib/api";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
} from "@/components/ui/input-group";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
} from "@/components/ui/empty";
import { AssistantConfirmation, AssistantError } from "./shared";

type Status = "all" | "enabled" | "disabled";

export function AssistantList() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [list, setList] = useState<Assistant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [deleteTarget, setDeleteTarget] = useState<Assistant | null>(null);
  const [audio, setAudio] = useState<string | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setList(await api<Assistant[]>("/assistants", { signal }));
    } catch (e) {
      if (!signal?.aborted) setError((e as Error).message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    queueMicrotask(() => {
      if (!abort.signal.aborted) void load(abort.signal);
    });
    return () => abort.abort();
  }, [load]);
  async function action(a: Assistant, kind: "delete" | "preview") {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setActionError("");
    try {
      if (kind === "delete") {
        await api(`/assistants/${a.id}`, { method: "DELETE" });
        setList((current) => current.filter((item) => item.id !== a.id));
        setAudio(null);
        setDeleteTarget(null);
      } else {
        const result = await api<{ audio: string }>(
          `/assistants/${a.id}/preview`,
          { method: "POST" },
        );
        setAudio("data:audio/mpeg;base64," + result.audio);
      }
    } catch (e) {
      setActionError((e as Error).message);
      if (kind === "delete") setDeleteTarget(null);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  const visible = list.filter(
    (a) =>
      (status === "all" || a.enabled === (status === "enabled")) &&
      `${a.name} ${a.instructions} ${a.llm_model} ${a.voice}`
        .toLocaleLowerCase(locale)
        .includes(search.trim().toLocaleLowerCase(locale)),
  );
  const filters = (
    <nav
      aria-label={t("assistants.filters")}
      className="flex flex-col gap-1 p-3"
    >
      {(["all", "enabled", "disabled"] as const).map((key) => (
        <Button
          key={key}
          variant={status === key ? "secondary" : "ghost"}
          className="w-full justify-between"
          aria-current={status === key ? "true" : undefined}
          onClick={() => {
            setStatus(key);
            setFiltersOpen(false);
          }}
        >
          <span>{t(`assistants.${key}`)}</span>
          <span className="tabular-nums">
            {loading
              ? "—"
              : new Intl.NumberFormat(locale).format(
                  list.filter(
                    (a) => key === "all" || a.enabled === (key === "enabled"),
                  ).length,
                )}
          </span>
        </Button>
      ))}
    </nav>
  );
  const toolbar = (
    <>
      <div className="md:hidden">
        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetTrigger render={<Button size="sm" variant="outline" />}>
            <Filter data-icon="inline-start" />
            {t("assistants.filters")}
          </SheetTrigger>
          <SheetContent side="left">
            <SheetHeader>
              <SheetTitle>{t("assistants.filters")}</SheetTitle>
            </SheetHeader>
            {filters}
          </SheetContent>
        </Sheet>
      </div>
      <Field className="max-w-sm">
        <FieldLabel htmlFor="assistant-search" className="sr-only">
          {t("assistants.search")}
        </FieldLabel>
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            id="assistant-search"
            placeholder={t("assistants.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
      </Field>
    </>
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <AssistantConfirmation
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t("assistants.delete")}
        description={t("assistants.deleteThisAssistant")}
        busy={busy}
        onConfirm={() => {
          if (deleteTarget) void action(deleteTarget, "delete");
        }}
      />
      <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 lg:px-6">
        <div className="flex items-center gap-3">
          <Bot className="size-5 text-muted-foreground" />
          <h1 className="font-semibold">{t("workspace.assistants")}</h1>
        </div>
        <Link className={buttonVariants({ size: "sm" })} href="/assistants/new">
          <Plus data-icon="inline-start" />
          {t("assistants.newAssistant")}
        </Link>
      </header>
      <AssistantSplit navigation={filters}>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {error ? (
              <div className="p-6">
                <AssistantError
                  message={error}
                  retry={() => {
                    setLoading(true);
                    setError("");
                    void load();
                  }}
                />
              </div>
            ) : (
              <>
                {actionError && (
                  <div className="shrink-0 p-4">
                    <AssistantError message={actionError} />
                  </div>
                )}
                {audio && (
                  <div className="shrink-0 p-4">
                    <audio
                      key={audio}
                      aria-label={t("assistants.previewVoice")}
                      controls
                      autoPlay
                      src={audio}
                      className="w-full"
                    />
                  </div>
                )}
                <AssistantTable
                  toolbar={toolbar}
                  data={visible}
                  loading={loading}
                  busy={busy}
                  onEdit={(a) => router.push(`/assistants/${a.id}`)}
                  onTalk={(a) => router.push(`/talk?assistant=${a.id}`)}
                  onPreview={(a) => void action(a, "preview")}
                  onDelete={setDeleteTarget}
                  empty={
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Bot />
                        </EmptyMedia>
                        <EmptyTitle>
                          {t(
                            list.length
                              ? "assistants.noMatches"
                              : "assistants.noAssistantsYet",
                          )}
                        </EmptyTitle>
                        <EmptyDescription>
                          {t(
                            list.length
                              ? "assistants.adjustFilters"
                              : "assistants.createAnAssistantWithYourModelsVoiceAnd",
                          )}
                        </EmptyDescription>
                      </EmptyHeader>
                      <EmptyContent>
                        {list.length ? (
                          <Button
                            variant="outline"
                            onClick={() => {
                              setStatus("all");
                              setSearch("");
                            }}
                          >
                            {t("assistants.clearFilters")}
                          </Button>
                        ) : (
                          <Link
                            className={buttonVariants({ variant: "outline" })}
                            href="/assistants/new"
                          >
                            {t("assistants.newAssistant")}
                          </Link>
                        )}
                      </EmptyContent>
                    </Empty>
                  }
                />
              </>
            )}
          </div>
        </div>
      </AssistantSplit>
    </div>
  );
}
