"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Check,
  ChevronUp,
  LoaderCircle,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";
import { localizeMessage } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import { api, json, type Project } from "@/lib/api";
import {
  RecapTracker,
  recapProgress,
  type RecapEntry,
} from "@/lib/recap-progress";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const RecapContext = createContext<RecapTracker | null>(null);

export function useRecapProgress() {
  const tracker = useContext(RecapContext);
  if (!tracker)
    throw new Error("Recap progress requires the workspace provider.");
  return tracker;
}

function EntryProgress({ entry }: { entry: RecapEntry }) {
  const t = useTranslations("recapProgress");
  const tracker = useRecapProgress();
  const state = recapProgress(entry);
  const label = entry.unavailable
    ? t("unavailable")
    : entry.pending
      ? t(entry.id ? "retrying" : "creating")
      : !entry.project && entry.id
        ? t("restoring")
        : state.failed && !entry.project
          ? t("failed")
          : t(state.step);
  return (
    <div className="flex items-end gap-3">
      <Progress
        className="min-w-0 flex-1"
        value={state.percent}
        aria-label={entry.title || t("title")}
      >
        <ProgressLabel aria-live="polite">{label}</ProgressLabel>
        <ProgressValue />
      </Progress>
      {(state.failed || entry.unavailable) && entry.id && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                disabled={entry.pending}
                aria-label={t(entry.unavailable ? "checkAgain" : "retry")}
                onClick={() => {
                  if (entry.unavailable) void tracker.check(entry.id!);
                  else void tracker.retry(entry.id!);
                }}
              />
            }
          >
            <RotateCcw data-icon="inline-start" />
          </TooltipTrigger>
          <TooltipContent>
            {t(entry.unavailable ? "checkAgain" : "retry")}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function EntryStatus({ entry }: { entry: RecapEntry }) {
  const state = recapProgress(entry);
  if (entry.pending)
    return (
      <LoaderCircle
        className="shrink-0 motion-safe:animate-spin"
        aria-hidden="true"
      />
    );
  if (state.failed || entry.unavailable)
    return (
      <TriangleAlert className="shrink-0 text-destructive" aria-hidden="true" />
    );
  if (state.complete) return <Check className="shrink-0" aria-hidden="true" />;
  return (
    <LoaderCircle
      className="shrink-0 motion-safe:animate-spin"
      aria-hidden="true"
    />
  );
}

export function RecapProgressProvider({
  userId,
  children,
}: {
  userId: number;
  children: React.ReactNode;
}) {
  const t = useTranslations("recapProgress");
  const shared = useTranslations("shared");
  const locale = resolveLocale(useLocale());
  const router = useRouter();
  const [tracker] = useState(() => {
    const storageKey = `recap-progress:${userId}`;
    return new RecapTracker({
      create: (data, signal) =>
        api<Project>("/projects", { method: "POST", body: json(data), signal }),
      load: (id, signal) => api<Project>(`/projects/${id}`, { signal }),
      retry: (id, signal) =>
        api<Project>(`/projects/${id}/generate`, {
          method: "POST",
          body: json({ stage: "script" }),
          signal,
        }),
      readIds: () => {
        try {
          return JSON.parse(sessionStorage.getItem(storageKey) || "[]");
        } catch {
          return [];
        }
      },
      saveIds: (ids) => {
        try {
          if (ids.length)
            sessionStorage.setItem(storageKey, JSON.stringify(ids));
          else sessionStorage.removeItem(storageKey);
        } catch {
          /* Tracking still works when browser storage is unavailable. */
        }
      },
      schedule: (callback) => setTimeout(callback, 3000),
      cancel: (timer) => clearTimeout(timer),
    });
  });
  const snapshot = useSyncExternalStore(
    tracker.subscribe,
    tracker.getSnapshot,
    tracker.getSnapshot,
  );
  useEffect(() => {
    tracker.start();
    return tracker.stop;
  }, [tracker]);
  const selected = snapshot.entries.find(
    (entry) => entry.key === snapshot.selected,
  );
  const minimized = snapshot.entries.filter(
    (entry) => entry.key !== selected?.key,
  );

  function openEditor(entry: RecapEntry) {
    if (!entry.id) return;
    tracker.dismiss(entry.key);
    router.push(`/projects/${entry.id}`);
  }

  function actions(entry: RecapEntry) {
    const state = recapProgress(entry);
    return (
      <>
        {(state.complete || state.failed) && entry.id && (
          <Button disabled={entry.pending} onClick={() => openEditor(entry)}>
            {t("openEditor")}
          </Button>
        )}
        {!state.active && (
          <Button
            variant="ghost"
            disabled={entry.pending}
            onClick={() => tracker.dismiss(entry.key)}
          >
            {t("dismiss")}
          </Button>
        )}
      </>
    );
  }

  return (
    <RecapContext.Provider value={tracker}>
      {children}
      {minimized.length > 0 && (
        <Card
          className="fixed right-4 bottom-4 z-40 w-[calc(100%-2rem)] gap-3 shadow-lg sm:w-80"
          role="region"
          aria-label={t("panelTitle")}
        >
          <CardHeader>
            <CardTitle>{t("panelTitle")}</CardTitle>
            <CardDescription>{t("panelDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="flex max-h-[50svh] flex-col gap-4 overflow-y-auto">
            {minimized.map((entry) => (
              <div key={entry.key} className="flex flex-col gap-2">
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => tracker.select(entry.key)}
                  aria-label={t("showDetails", {
                    title: entry.title || t("title"),
                  })}
                >
                  <EntryStatus entry={entry} />
                  <span className="truncate">
                    {entry.title || t("restoring")}
                  </span>
                  <ChevronUp data-icon="inline-end" />
                </Button>
                <EntryProgress entry={entry} />
                {(entry.unavailable || recapProgress(entry).failed) && (
                  <p className="text-sm text-destructive">
                    {entry.unavailable
                      ? t("connectionError")
                      : localizeMessage(
                          entry.error || entry.project?.error || t("failed"),
                          locale,
                        )}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">{actions(entry)}</div>
              </div>
            ))}
          </CardContent>
          <CardFooter className="text-xs text-muted-foreground">
            {t("stageHint")}
          </CardFooter>
        </Card>
      )}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) tracker.select(null);
        }}
      >
        {selected && (
          <DialogContent showCloseButton={false}>
            <DialogClose
              render={
                <Button
                  variant="ghost"
                  className="absolute top-2 right-2"
                  aria-label={shared("close")}
                />
              }
            >
              <X data-icon="inline-start" />
            </DialogClose>
            <DialogHeader>
              <DialogTitle>
                {t(
                  recapProgress(selected).complete
                    ? "complete"
                    : recapProgress(selected).failed
                      ? "failed"
                      : "title",
                )}
              </DialogTitle>
              <DialogDescription>
                {selected.title || t("restoring")}
              </DialogDescription>
            </DialogHeader>
            <EntryProgress entry={selected} />
            {selected.unavailable ||
            selected.error ||
            selected.project?.error ? (
              <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>
                  {selected.unavailable ? t("unavailable") : t("failed")}
                </AlertTitle>
                <AlertDescription>
                  {selected.unavailable
                    ? t("connectionError")
                    : localizeMessage(
                        selected.error ||
                          selected.project?.error ||
                          t("failed"),
                        locale,
                      )}
                </AlertDescription>
              </Alert>
            ) : recapProgress(selected).complete ? (
              <p role="status" className="text-sm">
                {t("ready")}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("backgroundHint")}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{t("stageHint")}</p>
            <DialogFooter>
              {actions(selected)}
              {recapProgress(selected).active && (
                <Button variant="outline" onClick={() => tracker.select(null)}>
                  {t("minimize")}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </RecapContext.Provider>
  );
}
