import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  symlink,
  rm,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { projectFile, serveMedia } from "./private-media.mjs";

test("media access rejects traversal, other projects, and symlinks outside the project", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "private-media-"));
  try {
    await mkdir(path.join(root, "projects/1"), { recursive: true });
    await mkdir(path.join(root, "projects/2"), { recursive: true });
    await writeFile(path.join(root, "projects/1/video.mp4"), "video");
    await writeFile(path.join(root, "projects/2/private.mp4"), "private");
    await symlink("../2/private.mp4", path.join(root, "projects/1/link.mp4"));
    assert.equal(
      await projectFile(root, "projects/1/video.mp4", "1"),
      await realpath(path.join(root, "projects/1/video.mp4")),
    );
    for (const file of [
      "projects/2/private.mp4",
      "projects/1/../2/private.mp4",
      "projects/1/link.mp4",
      "projects/1/",
    ])
      await assert.rejects(projectFile(root, file, "1"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("render-scoped media streams support byte ranges and expose only supplied files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "media-stream-"));
  let media;
  try {
    const file = path.join(root, "source.mp4");
    await writeFile(file, "0123456789");
    media = await serveMedia([file]);
    const response = await fetch(media.urls[0], {
      headers: { Range: "bytes=2-5" },
    });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-range"), "bytes 2-5/10");
    assert.equal(await response.text(), "2345");
    assert.equal(
      await (
        await fetch(media.urls[0], { headers: { Range: "bytes=-3" } })
      ).text(),
      "789",
    );
    const head = await fetch(media.urls[0], { method: "HEAD" });
    assert.equal(head.headers.get("content-length"), "10");
    assert.equal(await head.text(), "");
    assert.equal(
      (await fetch(media.urls[0], { headers: { Range: "bytes=20-" } })).status,
      416,
    );
    assert.equal(
      (await fetch(new URL("/source.mp4", media.urls[0]))).status,
      404,
    );
    assert.equal(
      (await fetch(media.urls[0].replace(/\/0$/, "/1"))).status,
      404,
    );
  } finally {
    await media?.close();
    await rm(root, { recursive: true, force: true });
  }
});
