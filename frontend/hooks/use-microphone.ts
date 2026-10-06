"use client";
import { useTranslations } from "next-intl";

import { useEffect, useRef, useState, useCallback } from "react";
export function useMicrophone(
  onAudio: (blob: Blob) => void,
  silenceMs = 1200,
  automatic = false,
  onSpeech?: () => void,
) {
  const t = useTranslations();

  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const callback = useRef(onAudio);
  useEffect(() => {
    callback.current = onAudio;
  }, [onAudio]);
  const cleanup = useRef<() => void>(() => {});
  const discard = useRef(false);
  const spokenRef = useRef(false);
  const speechCallback = useRef(onSpeech);
  useEffect(() => {
    speechCallback.current = onSpeech;
  }, [onSpeech]);
  const stop = useCallback((drop = false) => {
    discard.current = drop;
    if (recorder.current?.state === "recording") {
      recorder.current.stop();
    } else {
      setActive(false);
    }
    cleanup.current();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);
  const start = useCallback(async () => {
    discard.current = false;
    spokenRef.current = false;
    setError("");
    try {
      if (!navigator.mediaDevices || !window.MediaRecorder)
        throw new Error(
          t("shared.theMicrophoneRequiresHttpsAndAModernBrowser"),
        );
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      stream.current = media;
      const mime = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus"].find(
        (m) => MediaRecorder.isTypeSupported(m),
      );
      if (!mime)
        throw new Error(t("shared.audioRecordingIsNotSupportedInThisBrowser"));
      const rec = new MediaRecorder(media, { mimeType: mime });
      recorder.current = rec;
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        if (
          chunks.length &&
          !discard.current &&
          (!automatic || spokenRef.current)
        )
          callback.current(new Blob(chunks, { type: mime }));
        setActive(false);
      };
      rec.start();
      setActive(true);
      const timeout = window.setTimeout(() => stop(), 30000);
      cleanup.current = () => clearTimeout(timeout);
      if (automatic) {
        const context = new AudioContext();
        const analyser = context.createAnalyser();
        context.createMediaStreamSource(media).connect(analyser);
        const buffer = new Float32Array(analyser.fftSize);
        let spoken = false,
          lastSpeech = Date.now();
        const interval = window.setInterval(() => {
          analyser.getFloatTimeDomainData(buffer);
          const rms = Math.sqrt(
            buffer.reduce((sum, v) => sum + v * v, 0) / buffer.length,
          );
          if (rms > 0.025) {
            if (!spoken) {
              spokenRef.current = true;
              speechCallback.current?.();
            }
            spoken = true;
            lastSpeech = Date.now();
          }
          if (spoken && Date.now() - lastSpeech > silenceMs) {
            stop();
          }
        }, 100);
        cleanup.current = () => {
          clearTimeout(timeout);
          clearInterval(interval);
          void context.close();
        };
      }
    } catch (e) {
      stop();
      setError((e as Error).message);
    }
  }, [automatic, silenceMs, stop, t]);
  useEffect(
    () => () => {
      if (recorder.current) {
        recorder.current.onstop = null;
      }
      cleanup.current();
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  return { active, error, start, stop };
}
