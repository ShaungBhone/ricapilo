"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Pencil, Search, Trash2, Clock, X } from "lucide-react";
import {
  Popover,
  PopoverPortal,
  PopoverPositioner,
  PopoverPopup,
} from "@/components/ui/popover";
import type { Caption } from "@/lib/api";
import {
  createTranscriptParts,
  createWordSelection,
  deleteSelectedWords,
  selectionText,
  transcriptWords,
  updateSelectedWord,
  type WordSelection,
} from "@/lib/transcript-selection";
import { cn } from "@/lib/utils";
import { Blank } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function CaptionTranscript({
  captions,
  currentTimeMs,
  disabled,
  onChange,
  onSeek,
  onDownload,
}: {
  captions: Caption[];
  currentTimeMs: number;
  disabled: boolean;
  onChange: (captions: Caption[]) => void;
  onSeek: (ms: number) => void;
  onDownload: (format: string) => void;
}) {
  const t = useTranslations("editor");
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<{
    captions: Caption[];
    selection: WordSelection;
  } | null>(null);
  const [inspected, setInspected] = useState<{
    captions: Caption[];
    index: number;
  } | null>(null);
  const selection =
    chosen?.captions === captions && !disabled ? chosen.selection : null;
  const captionIndex =
    inspected?.captions === captions && !disabled ? inspected.index : null;
  const elements = useRef(new Map<number, HTMLButtonElement>());
  const parts = useMemo(() => createTranscriptParts(captions), [captions]);
  const words = useMemo(() => transcriptWords(parts), [parts]);
  const search = query.trim().toLocaleLowerCase();
  const matches = captions.reduce(
    (sum, caption) =>
      sum +
      (search ? caption.text.toLocaleLowerCase().split(search).length - 1 : 0),
    0,
  );

  const dismiss = () => {
    setChosen(null);
    setInspected(null);
  };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setChosen(null);
        setInspected(null);
      }
    };
    const pointerdown = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        !event.target.closest("[data-transcript-selection]")
      ) {
        setChosen(null);
        setInspected(null);
      }
    };
    document.addEventListener("keydown", keydown);
    document.addEventListener("pointerdown", pointerdown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("pointerdown", pointerdown);
    };
  }, []);

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b px-4 pb-3">
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            aria-label={t("searchCaptions")}
            placeholder={t("searchCaptions")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              dismiss();
            }}
          />
        </InputGroup>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                disabled={!captions.length}
                aria-label={t("downloadCaptions")}
              />
            }
          >
            <Download />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              {["txt", "srt", "vtt"].map((format) => (
                <DropdownMenuItem
                  key={format}
                  onClick={() => onDownload(format)}
                >
                  {format.toUpperCase()}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {search && (
        <p
          role="status"
          className="shrink-0 px-4 py-2 text-xs text-muted-foreground"
        >
          {t("searchMatches", { count: matches })}
        </p>
      )}
      <div
        className="min-h-0 flex-1 overflow-y-auto p-4 text-sm leading-loose whitespace-pre-wrap"
        onScroll={dismiss}
        data-testid="caption-transcript"
      >
        {!captions.length ? (
          <Blank
            title={t("noCaptions")}
            description={t("generateNarrationFirst")}
          />
        ) : (
          parts.map((part, index) => {
            if (part.kind === "text")
              return <span key={index}>{part.text}</span>;
            const { word } = part;
            const active =
              currentTimeMs >= word.startMs && currentTimeMs < word.endMs;
            const selected =
              selection !== null &&
              word.index >= selection.startIndex &&
              word.index <= selection.endIndex;
            const match =
              search &&
              captions[word.captionIndex].text
                .toLocaleLowerCase()
                .includes(search);
            return (
              <button
                key={index}
                type="button"
                ref={(node) => {
                  if (node) elements.current.set(word.index, node);
                  else elements.current.delete(word.index);
                }}
                data-transcript-selection
                data-active={active}
                aria-pressed={selected}
                className={cn(
                  "inline rounded-sm text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "text-primary" : "text-muted-foreground",
                  match && "bg-primary/15 text-foreground",
                  search && !match && "opacity-40",
                  selected && "bg-primary/25 text-foreground",
                )}
                onClick={(e) => {
                  onSeek(word.startMs);
                  if (disabled) return;
                  const next = createWordSelection(
                    words,
                    e.shiftKey && selection
                      ? selection.anchorIndex
                      : word.index,
                    word.index,
                  );
                  if (next) setChosen({ captions, selection: next });
                  setInspected(null);
                }}
              >
                {word.text}
              </button>
            );
          })
        )}
      </div>
      {selection && captionIndex === null && (
        <Popover open modal={false}>
          <PopoverPortal>
            <PopoverPositioner
              side="top"
              sideOffset={8}
              anchor={{
                getBoundingClientRect: () =>
                  elements.current
                    .get(selection.focusIndex)
                    ?.getBoundingClientRect() ?? new DOMRect(),
              }}
            >
              <PopoverPopup initialFocus={false} data-transcript-selection>
                <WordTools
                  key={`${selection.anchorIndex}-${selection.focusIndex}`}
                  text={selectionText(words, selection)}
                  canEdit={selection.startIndex === selection.endIndex}
                  onEdit={(text) => {
                    onChange(
                      updateSelectedWord(captions, words, selection, text),
                    );
                    dismiss();
                  }}
                  onDelete={() => {
                    onChange(deleteSelectedWords(captions, words, selection));
                    dismiss();
                  }}
                  onTiming={() =>
                    setInspected({
                      captions,
                      index: words[selection.focusIndex].captionIndex,
                    })
                  }
                />
              </PopoverPopup>
            </PopoverPositioner>
          </PopoverPortal>
        </Popover>
      )}
      {captionIndex !== null && captions[captionIndex] && (
        <div
          data-transcript-selection
          className="max-h-[55%] shrink-0 overflow-y-auto border-t p-4"
        >
          <CaptionInspector
            caption={captions[captionIndex]}
            onClose={dismiss}
            onSave={(caption) => {
              onChange(
                captions.map((item, index) =>
                  index === captionIndex ? caption : item,
                ),
              );
              dismiss();
            }}
          />
        </div>
      )}
    </>
  );
}

function WordTools({
  text,
  canEdit,
  onEdit,
  onDelete,
  onTiming,
}: {
  text: string;
  canEdit: boolean;
  onEdit: (text: string) => void;
  onDelete: () => void;
  onTiming: () => void;
}) {
  const t = useTranslations("editor");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(text);
  return editing ? (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onEdit(value);
      }}
    >
      <Field>
        <FieldLabel htmlFor="selected-word">{t("editWord")}</FieldLabel>
        <Input
          id="selected-word"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </Field>
      <Button type="submit" disabled={!value.trim()}>
        {t("save")}
      </Button>
      <Button variant="ghost" type="button" onClick={() => setEditing(false)}>
        {t("cancelEdit")}
      </Button>
    </form>
  ) : (
    <div
      role="toolbar"
      aria-label={t("wordActions")}
      className="flex flex-wrap gap-1"
    >
      {canEdit && (
        <Button variant="outline" onClick={() => setEditing(true)}>
          <Pencil data-icon="inline-start" />
          {t("editWord")}
        </Button>
      )}
      <Button variant="outline" onClick={onTiming}>
        <Clock data-icon="inline-start" />
        {t("editCaption")}
      </Button>
      <Button variant="outline" onClick={onDelete}>
        <Trash2 data-icon="inline-start" />
        {t("deleteSelection")}
      </Button>
    </div>
  );
}

function CaptionInspector({
  caption,
  onClose,
  onSave,
}: {
  caption: Caption;
  onClose: () => void;
  onSave: (caption: Caption) => void;
}) {
  const t = useTranslations("editor");
  const [text, setText] = useState(caption.text);
  const [start, setStart] = useState(String(caption.startMs / 1000));
  const [end, setEnd] = useState(String(caption.endMs / 1000));
  const startMs = Math.round(Number(start) * 1000),
    endMs = Math.round(Number(end) * 1000);
  const invalid =
    !start.trim() ||
    !end.trim() ||
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    startMs < 0 ||
    endMs <= startMs;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!invalid && text.trim()) onSave({ text, startMs, endMs });
      }}
    >
      <FieldGroup>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{t("editCaption")}</p>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            aria-label={t("cancelEdit")}
          >
            <X />
          </Button>
        </div>
        <Field>
          <FieldLabel htmlFor="selected-caption">{t("captions")}</FieldLabel>
          <Textarea
            id="selected-caption"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
        <div className="flex gap-2">
          <Field data-invalid={invalid}>
            <FieldLabel htmlFor="selected-caption-start">
              {t("startMs")}
            </FieldLabel>
            <Input
              id="selected-caption-start"
              type="number"
              min={0}
              step={0.01}
              value={start}
              aria-invalid={invalid}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field data-invalid={invalid}>
            <FieldLabel htmlFor="selected-caption-end">{t("endMs")}</FieldLabel>
            <Input
              id="selected-caption-end"
              type="number"
              min={0}
              step={0.01}
              value={end}
              aria-invalid={invalid}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        </div>
        {invalid && (
          <p role="alert" className="text-sm text-destructive">
            {t("invalidCaptionTiming")}
          </p>
        )}
        <Button type="submit" disabled={invalid || !text.trim()}>
          {t("applyCaption")}
        </Button>
      </FieldGroup>
    </form>
  );
}
