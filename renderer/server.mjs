import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { subtitles } from "./captions.mjs";
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
    const vertical = input.format === "vertical";
    const w = vertical ? 720 : 1280,
      h = vertical ? 1280 : 720;
    const ass = path.join(dir, "captions.ass");
    await writeFile(
      ass,
      subtitles(input.captions, vertical, input.captionStyle),
    );
    const out = path.join(dir, "recap.mp4");
    let footage = null;
    if (input.mediaPath) {
      const media = safeFile(input.mediaPath, id);
      const { stdout } = await execute(
        "ffprobe",
        [
          "-v",
          "error",
          "-select_streams",
          "v:0",
          "-show_entries",
          "stream=codec_type",
          "-of",
          "json",
          media,
        ],
        { timeout: 10000 },
      );
      if (JSON.parse(stdout).streams?.length) footage = media;
    }
    const inputs = footage
      ? ["-stream_loop", "-1", "-i", footage]
      : ["-f", "lavfi", "-i", `color=c=0x132030:s=${w}x${h}:r=30`];
    const filter = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,subtitles=${ass}`;
    await run([
      "-y",
      ...inputs,
      "-i",
      audio,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-vf",
      filter,
      "-r",
      "30",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-shortest",
      "-movflags",
      "+faststart",
      out,
    ]);
    send(200, { path: `projects/${id}/recap.mp4` });
  } catch (e) {
    send(500, { error: "Rendering failed" });
    console.error(e.message);
  } finally {
    if (ownsSlot) busy = false;
  }
});
server.listen(Number(process.env.PORT || 4000), "0.0.0.0");
