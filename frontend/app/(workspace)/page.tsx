"use client";
import { useLocale, useTranslations } from "next-intl";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  Mic,
  Square,
  Search,
  Upload,
  AudioLines,
  ArrowUpRight,
  Bot,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  InputGroup,
  InputGroupTextarea,
  InputGroupAddon,
} from "@/components/ui/input-group";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Blank, Feedback } from "@/components/feedback";
import { useMicrophone } from "@/hooks/use-microphone";
import { api, json, Assistant, Video } from "@/lib/api";
export default function Home() {
  const t = useTranslations();
  const locale = useLocale();
  const [popular, setPopular] = useState(false);

  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [assistant, setAssistant] = useState("");
  const [videos, setVideos] = useState<Video[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [searched, setSearched] = useState(false);
  useEffect(() => {
    api<Assistant[]>("/assistants")
      .then((a) => {
        setAssistants(a.filter((x) => x.enabled));
        if (a[0]) setAssistant(String(a[0].id));
      })
      .catch((e) => setMessage(e.message));
  }, []);
  const mic = useMicrophone(async (blob) => {
    if (!assistant) {
      setMessage(t("workspace.chooseAnAssistantFirst"));
      return;
    }
    setBusy(true);
    const f = new FormData();
    f.append(
      "audio",
      blob,
      blob.type.includes("ogg") ? "voice.ogg" : "voice.webm",
    );
    f.append("assistant_id", assistant);
    try {
      const r = await api<{ text: string }>("/transcribe", {
        method: "POST",
        body: f,
      });
      setPrompt(r.text);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  });
  async function search() {
    setBusy(true);
    setMessage("");
    try {
      const r = await api<{
        videos: Video[];
        warnings: string[];
        criteria?: { mode?: string } | null;
      }>("/discover", {
        method: "POST",
        body: json({ prompt, assistant_id: assistant || null }),
      });
      setVideos(r.videos);
      setPopular(r.criteria?.mode === "popular");
      setSearched(true);
      setMessage(r.warnings.join("\n"));
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function select(v: Video) {
    if (!assistant) {
      setMessage(t("workspace.chooseAnAssistantForThisProject"));
      return;
    }
    setBusy(true);
    try {
      const p = await api<{ id: number }>("/projects", {
        method: "POST",
        body: json({
          title: v.title,
          source: v.platform,
          source_id: v.id,
          assistant_id: Number(assistant),
          format: "vertical",
          target_seconds: 60,
        }),
      });
      router.push(`/projects/${p.id}`);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-8">
      <section className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 py-10 md:py-16">
        <Badge variant="secondary">
          <AudioLines /> {t("workspace.yourPersonalAiWorkspace")}
        </Badge>
        <div className="flex flex-col gap-4 text-center">
          <h1 className="text-3xl leading-relaxed font-semibold tracking-tight md:text-5xl">
            {t("workspace.whatStoryWouldYouLikeToCreate")}
          </h1>
          <p className="leading-8 text-muted-foreground">
            {t("workspace.findVideosWriteBurmeseRecapsChooseYourVoice")}
          </p>
        </div>
        <form
          className="w-full"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <InputGroup className="rounded-2xl">
            <InputGroupTextarea
              aria-label={t("workspace.yourRequest")}
              placeholder={t("workspace.findPopularShortVideosAboutSpace")}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-32"
            />
            <InputGroupAddon align="block-end">
              <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:max-w-56 sm:flex-none">
                <Bot aria-hidden="true" className="size-4 shrink-0" />
                <NativeSelect
                  className="min-w-0 flex-1"
                  aria-label={t("workspace.chooseAssistant")}
                  value={assistant}
                  onChange={(e) => setAssistant(e.target.value)}
                >
                  <NativeSelectOption value="">
                    {t("workspace.chooseAnAssistant")}
                  </NativeSelectOption>
                  {assistants.map((a) => (
                    <NativeSelectOption key={a.id} value={a.id}>
                      {a.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Link
                      className={buttonVariants({
                        variant: "ghost",
                        size: "icon",
                      })}
                      href="/projects/new"
                      aria-label={t("workspace.startWithYourOwnFile")}
                    >
                      <Upload aria-hidden="true" />
                    </Link>
                  }
                />
                <TooltipContent>
                  {t("workspace.startWithYourOwnFile")}
                </TooltipContent>
              </Tooltip>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={
                  mic.active
                    ? t("workspace.stopRecording")
                    : t("workspace.useVoiceInput")
                }
                disabled={busy || !assistant}
                onClick={() => (mic.active ? mic.stop() : void mic.start())}
              >
                {mic.active ? <Square /> : <Mic />}
              </Button>
              <Button
                type="submit"
                className="ml-auto"
                size="icon"
                aria-label={t("workspace.search")}
                disabled={busy || !prompt.trim()}
              >
                <ArrowUp />
              </Button>
            </InputGroupAddon>
          </InputGroup>
        </form>
        <Feedback message={message || mic.error} />
        {busy && (
          <p role="status" className="text-sm text-muted-foreground">
            {t("authentication.pleaseWait")}
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          {[
            t("workspace.giveMeViralVideosToRecap"),
            t("workspace.shortVideosAboutSpace"),
            t("workspace.koreanMovieTrailers"),
            t("workspace.natureVideos"),
          ].map((text) => (
            <Button
              key={text}
              variant="outline"
              size="sm"
              onClick={() => setPrompt(text)}
            >
              <Search data-icon="inline-start" />
              {text}
            </Button>
          ))}
        </div>
      </section>
      {!assistants.length && (
        <Blank
          title={t("workspace.createYourAssistant")}
          description={t("workspace.addYourOpenrouterKeyInSettingsThenChoose")}
        />
      )}
      {searched && (
        <section className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {t(
                popular
                  ? "workspace.recentPopularVideos"
                  : "workspace.searchResults",
              )}
            </h2>
            <Badge variant="outline">
              {t("shared.videoCount", { count: videos.length })}
            </Badge>
          </div>
          {popular && (
            <p className="text-sm text-muted-foreground">
              {t("workspace.popularityNote")}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {t("workspace.accessNote")}
          </p>
          {!videos.length && (
            <Blank
              title={t("workspace.noVideosFound")}
              description={t("workspace.trySearchingWithDifferentWords")}
            />
          )}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((v) => (
              <Card key={v.platform + v.id} className="overflow-hidden">
                <CardHeader>
                  <CardTitle className="line-clamp-2 leading-7">
                    {v.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {v.thumbnail && (
                    <Image
                      src={v.thumbnail}
                      alt=""
                      unoptimized
                      referrerPolicy="no-referrer"
                      width={360}
                      height={203}
                      className="aspect-video w-full rounded-xl object-cover"
                    />
                  )}
                  <p className="text-sm text-muted-foreground">
                    {v.creator} ·{" "}
                    {v.views != null &&
                      t("shared.viewCount", { count: v.views })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("workspace.durationSeconds", { count: v.duration })}
                    {v.published_at &&
                      ` · ${new Date(v.published_at).toLocaleDateString(locale)}`}
                  </p>
                  <p className="text-sm">{v.reason}</p>
                </CardContent>
                <CardFooter className="gap-2">
                  <Button disabled={busy} onClick={() => void select(v)}>
                    {t("workspace.createRecap")}
                  </Button>
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({
                      variant: "ghost",
                      size: "icon",
                    })}
                    aria-label={t("workspace.watchOriginalVideo")}
                  >
                    <ArrowUpRight />
                  </a>
                </CardFooter>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
