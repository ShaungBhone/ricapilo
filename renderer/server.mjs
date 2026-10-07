import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { subtitles } from "./captions.mjs";
import { renderPlan } from "./render.mjs";
import { ratios, layouts, templates } from "../frontend/lib/editor-core.mjs";
const execute = promisify(execFile);
const root = process.env.MEDIA_ROOT || "/media";
const token = process.env.RENDERER_TOKEN || "";
let busy = false;
function validAuth(header) {
  const incoming = (header || "").replace(/^Bearer /, "");
  return (
    token.length > 0 &&
    Buffer.byteLength(incoming) === Buffer.byteLength(token) &&
    timingSafeEqual(Buffer.from(incoming), Buffer.from(token))
  );
}
function safeFile(relative, id) {
  if (typeof relative !== "string" || !relative.startsWith(`projects/${id}/`))
    throw Error("Invalid media path");
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(path.resolve(root, "projects", id) + path.sep))
    throw Error("Invalid path");
  return resolved;
}
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let log = "";
    child.stderr.on("data", (d) => {
      log = (log + d.toString()).slice(-2000);
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), 1200000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(Error("FFmpeg render failed"));
    });
  });
}
const server = http.createServer(async (req, res) => {
  const send = (code, data) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  if (req.url === "/health") {
    send(200, { status: "ok" });
    return;
  }
  if (req.method !== "POST" || req.url !== "/render") {
    send(404, { error: "Not found" });
    return;
  }
  if (!validAuth(req.headers.authorization)) {
    send(401, { error: "Unauthorized" });
    return;
  }
  if (busy) {
    send(409, { error: "Renderer busy" });
    return;
  }
  let body = "";
  let ownsSlot = false;
  try {
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 1048576) throw Error("Request too large");
    }
    const input = JSON.parse(body);
    const id = String(input.projectId);
    if (!/^\d+$/.test(id)) throw Error("Invalid project");
    if (
      !Array.isArray(input.captions) ||
      !["vertical", "landscape"].includes(input.format)
    )
      throw Error("Invalid render settings");
    if (busy) {
      send(409, { error: "Renderer busy" });
      return;
    }
    busy = true;
    ownsSlot = true;
    const dir = path.join(root, "projects", id);
    await mkdir(dir, { recursive: true });
    const audio = safeFile(input.audioPath, id);
    await access(audio);
    const settings = input.editorSettings ?? {
      version: 1,
      aspectRatio: input.format === "vertical" ? "9:16" : "16:9",
      layout: "fill",
      slots: [
        {
          assetId: input.mediaPath ? "source" : null,
          mode: "fill",
          x: 0.5,
          y: 0.5,
          scale: 1,
          visible: true,
        },
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
    };
    if (
      !ratios[settings.aspectRatio] ||
      !layouts.includes(settings.layout) ||
      !templates.includes(input.captionStyle) ||
      settings.version !== 1
    )
      throw Error("Invalid editor settings");
    const probe = async (file) => {
      const { stdout } = await execute(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration:stream=codec_type,width,height:stream_disposition=attached_pic:stream_side_data=rotation,side_data_type",
          "-of",
          "json",
          file,
        ],
        { timeout: 10000 },
      );
      const info = JSON.parse(stdout),
        video = info.streams?.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
      const rotation=video?.side_data_list?.find(s=>s.side_data_type==="Display Matrix")?.rotation ?? 0;
      const rotated=Math.abs(rotation)%180===90;
      return {
        duration: Number(info.format?.duration),
        width: (rotated?video?.height:video?.width) ?? 0,
        height: (rotated?video?.width:video?.height) ?? 0,
        kind: video ? "video" : "audio",
        hasAudio: info.streams?.some((s) => s.codec_type === "audio"),
      };
    };
    const narrationInfo = await probe(audio);
    if (!Number.isFinite(narrationInfo.duration) || narrationInfo.duration <= 0)
      throw Error("Invalid narration");
    const assets = [];
    for (const asset of input.assets ?? []) {
      const file = safeFile(asset.path, id);
      assets.push({ ...asset, ...(await probe(file)), path: file });
    }
    if (input.mediaPath) {
      const file = safeFile(input.mediaPath, id);
      assets.push({ id: "source", path: file, ...(await probe(file)) });
    }
    const [w, h] = ratios[settings.aspectRatio];
    const ass = path.join(dir, "captions.ass"),
      out = path.join(dir, "recap.mp4");
    await writeFile(
      ass,
      subtitles(
        input.captions,
        input.format === "vertical",
        input.captionStyle,
        { width: w, height: h, settings, duration: narrationInfo.duration },
      ),
    );
    const plan = renderPlan(
      { ...input, editorSettings: settings, audioPath: audio },
      assets,
      narrationInfo.duration,
      ass,
      out,
    );
    await run(plan.args);
    send(200, { path: `projects/${id}/recap.mp4` });
  } catch (e) {
    send(500, { error: "Rendering failed" });
    console.error(e.message);
  } finally {
    if (ownsSlot) busy = false;
  }
});
server.listen(Number(process.env.PORT || 4000), "0.0.0.0");
