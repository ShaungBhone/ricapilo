import { test } from "node:test";
import assert from "node:assert/strict";
import {
  projectDraft,
  changes,
  editHistory,
  moveHistory,
  reconcilePolling,
} from "./editor";
import type { Project } from "./api";
const project = {
  title: "Original",
  format: "vertical",
  caption_style: "clean-bottom",
  script: null,
  transcript: null,
  captions: null,
  editor_settings: null,
} as Project;
test("legacy projects initialize without media and map existing format", () => {
  const draft = projectDraft({ ...project, format: "landscape" }, []);
  assert.equal(draft.editor_settings.aspectRatio, "16:9");
  assert.equal(draft.editor_settings.slots[0].assetId, null);
  assert.equal(draft.editor_settings.audio.sourceMuted, true);
});
test("undo/redo restore document edits and a new edit discards redo", () => {
  const first = projectDraft(project, []);
  let h = editHistory(
    { past: [], present: first, future: [] },
    { ...first, title: "Edited" },
  );
  h = moveHistory(h, "undo");
  assert.deepEqual(h.present, first);
  h = moveHistory(h, "redo");
  assert.equal(h.present.title, "Edited");
  h = moveHistory(h, "undo");
  h = editHistory(h, { ...first, script: "Reviewed" });
  assert.equal(h.future.length, 0);
});
test("save sends only changed fields so unchanged script does not invalidate narration", () => {
  const first = projectDraft(project, []);
  assert.deepEqual(changes({ ...first, title: "Edited" }, first), {
    title: "Edited",
  });
  assert.deepEqual(changes(first, first), {});
});

test("polling preserves unsaved drafts and history, then picks up generated content after an explicit operation", () => {
  const baseline = projectDraft(project, []);
  const edited = editHistory(
    { past: [], present: baseline, future: [] },
    { ...baseline, title: "Unsaved title" },
  );
  const server = { ...baseline, script: "Generated remotely" };
  const poll = reconcilePolling(edited, baseline, server);
  assert.equal(poll.history.present.title, "Unsaved title");
  assert.equal(poll.history.past.length, 1);
  assert.equal(poll.saved.title, "Original");
  const reset = reconcilePolling(edited, baseline, server, true);
  assert.equal(reset.history.present.script, "Generated remotely");
  assert.equal(reset.history.past.length, 0);
  const clean = reconcilePolling(
    { past: [], present: baseline, future: [] },
    baseline,
    server,
  );
  assert.equal(clean.history.present.script, "Generated remotely");
});
