"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { api, API, json, type Project } from "@/lib/api";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Feedback } from "@/components/feedback";

export function SplitControls({
  enabled,
  minutes,
  onEnabled,
  onMinutes,
  disabled = false,
}: {
  enabled: boolean;
  minutes: number;
  onEnabled: (value: boolean) => void;
  onMinutes: (value: number) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("splitting");
  const id = useId();
  return (
    <FieldGroup>
      <Field orientation="horizontal">
        <input
          id={`${id}-enabled`}
          name="split_enabled"
          type="checkbox"
          role="switch"
          checked={enabled}
          onChange={(e) => {
            onEnabled(e.target.checked);
            if (
              !e.target.checked &&
              (!Number.isInteger(minutes) || minutes < 1 || minutes > 60)
            )
              onMinutes(5);
          }}
          disabled={disabled}
        />
        <FieldLabel htmlFor={`${id}-enabled`}>{t("enabled")}</FieldLabel>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-minutes`}>{t("minutes")}</FieldLabel>
        <Input
          id={`${id}-minutes`}
          name="split_minutes"
          type="number"
          min={1}
          max={60}
          step={1}
          required={enabled}
          value={Number.isNaN(minutes) ? "" : minutes}
          onChange={(e) => onMinutes(e.target.valueAsNumber)}
          disabled={disabled || !enabled}
        />
      </Field>
    </FieldGroup>
  );
}

function timestamp(seconds: number) {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}

export function VideoParts({
  project,
  disabled,
  onRefresh,
}: {
  project: Project;
  disabled: boolean;
  onRefresh: () => Promise<unknown>;
}) {
  const t = useTranslations("splitting");
  const [enabled, setEnabled] = useState(project.split_enabled);
  const [minutes, setMinutes] = useState(project.split_minutes);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function split() {
    setBusy(true);
    setMessage("");
    try {
      await api(`/projects/${project.id}`, {
        method: "PATCH",
        body: json({ split_enabled: enabled, split_minutes: minutes }),
      });
      if (enabled)
        await api(`/projects/${project.id}/split`, { method: "POST" });
      await onRefresh();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="shrink-0 border-t px-4 py-2">
      <summary className="cursor-pointer">{t("title")}</summary>
      <div className="flex max-h-72 flex-col gap-4 overflow-auto py-4">
        <SplitControls
          enabled={enabled}
          minutes={minutes}
          onEnabled={setEnabled}
          onMinutes={setMinutes}
          disabled={disabled || busy}
        />
        <Button
          type="button"
          disabled={
            disabled ||
            busy ||
            !Number.isInteger(minutes) ||
            minutes < 1 ||
            minutes > 60
          }
          onClick={() => void split()}
        >
          {busy ? t("saving") : enabled ? t("saveSplit") : t("save")}
        </Button>
        <Feedback message={message} />
        {(["source", "recap"] as const).map((kind) => {
          const result = project.video_splits[kind];
          if (!result) return null;
          return (
            <section
              key={kind}
              className="flex flex-col gap-3"
              aria-label={t(kind)}
            >
              <h3 className="font-medium">{t(kind)}</h3>
              <p role="status">
                {t(result.status)}{" "}
                {result.status === "processing" ? `${result.progress}%` : ""}
              </p>
              {result.error && (
                <>
                  <p role="alert">{result.error}</p>
                  <Button
                    disabled={disabled || busy}
                    onClick={() => void split()}
                  >
                    {t("retry")}
                  </Button>
                </>
              )}
              {result.parts.map((part) => {
                const url = `${API}/projects/${project.id}/parts/${kind}/${result.revision}/${part.number}`;
                return (
                  <div key={part.number} className="flex flex-col gap-2">
                    <p>
                      {t("part", { number: part.number })} ·{" "}
                      {timestamp(part.start)}–{timestamp(part.end)} ·{" "}
                      {t("duration", { seconds: Math.round(part.duration) })}
                    </p>
                    <video
                      controls
                      preload="none"
                      src={url}
                      className="max-h-48 max-w-full"
                      aria-label={t("part", { number: part.number })}
                    />
                    <a
                      className={buttonVariants({ variant: "outline" })}
                      href={`${url}?download=1`}
                      download
                    >
                      {t("download")}
                    </a>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </details>
  );
}
