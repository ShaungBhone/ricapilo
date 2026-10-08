import http from "node:http";
import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";

export async function projectFile(root, relative, id) {
  if (typeof relative !== "string" || !relative.startsWith(`projects/${id}/`))
    throw Error("Invalid media path");
  const project = path.resolve(root, "projects", id) + path.sep;
  const file = path.resolve(root, relative);
  if (!file.startsWith(project)) throw Error("Invalid media path");
  const resolved = await realpath(file);
  const mediaRoot = await realpath(root);
  if (!resolved.startsWith(path.join(mediaRoot, "projects", id) + path.sep))
    throw Error("Invalid media path");
  if (!(await stat(resolved)).isFile()) throw Error("Invalid media file");
  return resolved;
}

// Only the files explicitly supplied for this render are available, on loopback.
export async function serveMedia(files) {
  const secret = randomBytes(32).toString("hex");
  const entries = new Map(
    await Promise.all(
      files.map(async (file, i) => [
        `/${secret}/${i}`,
        { file, size: (await stat(file)).size },
      ]),
    ),
  );
  const server = http.createServer((req, res) => {
    const entry = entries.get(req.url);
    if (!entry || !["GET", "HEAD"].includes(req.method)) {
      res.writeHead(404).end();
      return;
    }
    const { file, size } = entry;
    let start = 0,
      end = size - 1;
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!match || (!match[1] && !match[2])) {
        res.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
        return;
      }
      start = match[1]
        ? Number(match[1])
        : Math.max(0, size - Number(match[2]));
      end =
        match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
      if (start > end || start >= size) {
        res.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
        return;
      }
    }
    const types = {
      ".mp4": "video/mp4",
      ".mov": "video/quicktime",
      ".webm": "video/webm",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".m4a": "audio/mp4",
      ".ogg": "audio/ogg",
    };
    res.writeHead(req.headers.range ? 206 : 200, {
      "Content-Type":
        types[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": end - start + 1,
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
      ...(req.headers.range
        ? { "Content-Range": `bytes ${start}-${end}/${size}` }
        : {}),
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    const stream = createReadStream(file, { start, end });
    stream.on("error", () => res.destroy());
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    urls: files.map(
      (_, i) => `http://127.0.0.1:${server.address().port}/${secret}/${i}`,
    ),
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
