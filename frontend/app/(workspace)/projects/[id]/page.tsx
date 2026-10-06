"use client";
import { useTranslations } from "next-intl";

import { useEffect, useState, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { api, json, Project, API } from "@/lib/api";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { Feedback } from "@/components/feedback";
import { VideoPreview } from "@/components/video-preview";
export default function Detail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = useTranslations();

  const { id } = use(params);
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [script, setScript] = useState("");
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    const p = await api<Project>(`/projects/${id}`);
    setProject(p);
    return p;
  };
  const savedScript = useRef<string | null>(null);
  const savedTranscript = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    const poll = () =>
      api<Project>(`/projects/${id}`).then((p) => {
        if (!active) return;
        setProject(p);
        if (savedScript.current !== p.script) {
          savedScript.current = p.script;
          setScript(p.script || "");
        }
        if (savedTranscript.current !== p.transcript) {
          savedTranscript.current = p.transcript;
          setTranscript(p.transcript || "");
        }
      });
    poll().catch((e) => setMessage(e.message));
    const timer = setInterval(() => {
      poll().catch(() => {});
    }, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id]);
  async function generate(stage: string) {
    setBusy(true);
    setMessage("");
    try {
      if (stage === "audio") {
        await api(`/projects/${id}`, {
          method: "PATCH",
          body: json({ script }),
        });
      }
      await api(`/projects/${id}/generate`, {
        method: "POST",
        body: json({ stage }),
      });
      await refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const processing =
    busy ||
    (!!project &&
      ["queued", "processing", "rendering"].includes(project.status));
  if (!project)
    return <Feedback message={message || t("authentication.pleaseWait")} />;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl leading-relaxed font-semibold">
          {project.title}
        </h1>
        <Badge variant="secondary">
          {t.has(`projects.${project.status}`)
            ? t(`projects.${project.status}`)
            : project.status}
        </Badge>
      </div>
      <Feedback message={message || project.error || ""} />
      <div className="grid gap-8 lg:grid-cols-2">
        <section className="flex flex-col gap-5">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="transcript">
                {t("projects.sourceTranscript")}
              </FieldLabel>
              <Textarea
                id="transcript"
                rows={6}
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                disabled={processing}
              />
            </Field>
            <Button
              variant="outline"
              disabled={processing || !transcript}
              onClick={async () => {
                try {
                  await api(`/projects/${id}`, {
                    method: "PATCH",
                    body: json({ transcript }),
                  });
                  await refresh();
                  setMessage(t("projects.sourceTranscriptSaved"));
                } catch (e) {
                  setMessage((e as Error).message);
                }
              }}
            >
              {t("projects.saveTranscript")}
            </Button>
            <Field>
              <FieldLabel htmlFor="file">
                {t("projects.uploadSourceFile")}
              </FieldLabel>
              <Input
                id="file"
                type="file"
                disabled={processing}
                accept="video/*,audio/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setBusy(true);
                  const f = new FormData();
                  f.append("file", file);
                  try {
                    await api(`/projects/${id}/upload`, {
                      method: "POST",
                      body: f,
                    });
                    await refresh();
                    setMessage(t("projects.fileUploaded"));
                  } catch (e) {
                    setMessage((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </Field>
          </FieldGroup>
          <Button disabled={processing} onClick={() => void generate("script")}>
            {t("projects.1GenerateBurmeseRecap")}
          </Button>
          <Field>
            <FieldLabel htmlFor="script">
              {t("projects.burmeseScript")}
            </FieldLabel>
            <Textarea
              id="script"
              rows={12}
              value={script}
              onChange={(e) => setScript(e.target.value)}
              disabled={processing}
            />
          </Field>
          <Button
            variant="outline"
            disabled={processing || !script.trim()}
            onClick={async () => {
              try {
                await api(`/projects/${id}`, {
                  method: "PATCH",
                  body: json({ script }),
                });
                setMessage(t("projects.scriptSaved"));
                await refresh();
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            {t("projects.saveScript")}
          </Button>
          <Button
            disabled={processing || !script.trim()}
            onClick={() => void generate("audio")}
          >
            {t("projects.2GenerateNarration")}
          </Button>
          <Button
            disabled={processing || !project.captions?.length}
            onClick={() => void generate("video")}
          >
            {t("projects.3RenderVideo")}
          </Button>
          <p className="text-xs leading-6 text-muted-foreground">
            {t("projects.eachAiRequestIsBilledToYourOpenrouter")}
          </p>
        </section>
        <section className="flex flex-col gap-5">
          <h2 className="text-lg font-semibold">{t("projects.preview")}</h2>
          <Field>
            <FieldLabel htmlFor="caption-style">
              {t("projects.captionStyle")}
            </FieldLabel>
            <NativeSelect
              id="caption-style"
              disabled={processing}
              value={project.caption_style}
              onChange={async (e) => {
                try {
                  await api(`/projects/${id}`, {
                    method: "PATCH",
                    body: json({ caption_style: e.target.value }),
                  });
                  await refresh();
                } catch (e) {
                  setMessage((e as Error).message);
                }
              }}
            >
              <NativeSelectOption value="clean-bottom">
                {t("projects.cleanBottom")}
              </NativeSelectOption>
              <NativeSelectOption value="boxed-minimal">
                {t("projects.boxedMinimal")}
              </NativeSelectOption>
            </NativeSelect>
          </Field>
          {project.status === "ready" ? (
            <video
              controls
              src={`${API}/projects/${id}/download/video`}
              className="mx-auto max-h-[640px] w-full rounded-xl"
            />
          ) : project.captions?.length ? (
            <VideoPreview
              captions={project.captions}
              title={project.title}
              format={project.format}
              style={project.caption_style}
            />
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-xl bg-muted p-8 text-center text-muted-foreground">
              {t("projects.generateNarrationToPreviewYourVideo")}
            </div>
          )}
          {project.captions?.length && (
            <audio
              controls
              src={`${API}/projects/${id}/download/audio`}
              className="w-full"
            />
          )}
          <div className="flex flex-wrap gap-2">
            {project.script && (
              <a
                href={`${API}/projects/${id}/download/script`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {t("projects.downloadScript")}
              </a>
            )}
            {project.captions?.length && (
              <a
                download
                href={`${API}/projects/${id}/download/audio`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {t("projects.downloadMp3")}
              </a>
            )}
            {project.status === "ready" && (
              <a
                download
                href={`${API}/projects/${id}/download/video`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {t("projects.downloadMp4")}
              </a>
            )}
          </div>
          <Button
            variant="ghost"
            disabled={processing}
            onClick={async () => {
              if (!confirm(t("projects.deleteThisProjectAndItsFiles"))) return;
              try {
                await api(`/projects/${id}`, { method: "DELETE" });
                router.push("/projects");
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            {t("projects.deleteProject")}
          </Button>
        </section>
      </div>
    </div>
  );
}
