import { test } from "node:test";
import assert from "node:assert/strict";
import type { Project } from "./api";
import { RecapTracker, recapProgress, storedRecapIds } from "./recap-progress";

function project(id = 1, status = "processing", percent = 50): Project {
  return {
    id,
    title: `Recap ${id}`,
    status,
    stage: "script",
    error: null,
    script: null,
    transcript: null,
    generation_progress: { step: "transcribing", percent },
  } as Project;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fixture(ids: unknown = []) {
  let stored = ids;
  const timers = new Map<ReturnType<typeof setTimeout>, () => void>();
  let timerSequence = 0;
  const loads: { id: number; signal: AbortSignal }[] = [];
  const creates: unknown[] = [];
  const retries: number[] = [];
  let load: (id: number) => Promise<Project> = async (id) => project(id);
  let create: () => Promise<Project> = async () =>
    project(creates.length, "queued", 0);
  const tracker = new RecapTracker({
    create: (data) => {
      creates.push(data);
      return create();
    },
    load: (id, signal) => {
      loads.push({ id, signal });
      return load(id);
    },
    retry: async (id) => {
      retries.push(id);
      return project(id, "queued", 0);
    },
    readIds: () => stored,
    saveIds: (value) => {
      stored = value;
    },
    schedule: (callback) => {
      const timer = ++timerSequence as unknown as ReturnType<typeof setTimeout>;
      timers.set(timer, callback);
      return timer;
    },
    cancel: (timer) => {
      timers.delete(timer);
    },
  });
  return {
    tracker,
    loads,
    creates,
    retries,
    timers,
    stored: () => stored,
    setLoad: (value: typeof load) => {
      load = value;
    },
    setCreate: (value: typeof create) => {
      create = value;
    },
  };
}

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

test("creation opens the dialog immediately and minimizing does not cancel tracking", async () => {
  const f = fixture();
  const pending = deferred<Project>();
  f.setCreate(() => pending.promise);
  f.tracker.start();
  const creation = f.tracker.create("New recap", { title: "New recap" });
  assert.equal(f.tracker.getSnapshot().entries[0].pending, true);
  assert.ok(f.tracker.getSnapshot().selected);
  f.tracker.select(null);
  pending.resolve(project(1));
  await creation;
  await flush();
  assert.equal(f.tracker.getSnapshot().selected, null);
  assert.equal(f.timers.size, 1);
  assert.deepEqual(f.stored(), [1]);
  f.tracker.select("1");
  assert.equal(f.tracker.getSnapshot().selected, "1");
  f.tracker.stop();
});

test("multiple recaps remain tracked when selection changes", async () => {
  const f = fixture();
  f.tracker.start();
  await f.tracker.create("First", {});
  await f.tracker.create("Second", {});
  await flush();
  assert.deepEqual(f.stored(), [1, 2]);
  assert.equal(f.timers.size, 2);
  f.tracker.select("1");
  assert.equal(f.tracker.getSnapshot().entries.length, 2);
  f.tracker.dismiss("2");
  assert.equal(f.tracker.getSnapshot().entries.length, 2);
  f.tracker.stop();
});

test("restoration fetches current state, filters stored IDs, and does not overlap polls", async () => {
  const f = fixture([1, 1, "2", -3, 2]);
  const pending = deferred<Project>();
  f.setLoad(() => pending.promise);
  f.tracker.start();
  await f.tracker.check(1);
  assert.deepEqual(
    f.loads.map((request) => request.id),
    [1, 2],
  );
  pending.resolve(project(1, "script_ready", 100));
  await flush();
  assert.equal(f.timers.size, 0);
  assert.deepEqual(storedRecapIds(null), []);
  f.tracker.stop();
});

test("terminal results stop polling and are retained until dismissed", async () => {
  const f = fixture([1]);
  f.setLoad(async () => project(1, "script_ready", 100));
  f.tracker.start();
  await flush();
  const entry = f.tracker.getSnapshot().entries[0];
  assert.equal(recapProgress(entry).percent, 100);
  assert.equal(f.timers.size, 0);
  assert.equal(f.tracker.getSnapshot().selected, null);
  f.tracker.dismiss("1");
  assert.deepEqual(f.stored(), []);
});

test("network failures retain progress and recover without recreating the recap", async () => {
  const f = fixture([1]);
  f.tracker.start();
  await flush();
  f.setLoad(async () => {
    throw new Error("Offline");
  });
  await f.tracker.check(1);
  let entry = f.tracker.getSnapshot().entries[0];
  assert.equal(entry.unavailable, true);
  assert.equal(recapProgress(entry).failed, false);
  assert.equal(recapProgress(entry).percent, 50);
  assert.equal(f.timers.size, 0);
  f.setLoad(async () => project(1, "processing", 80));
  await f.tracker.check(1);
  entry = f.tracker.getSnapshot().entries[0];
  assert.equal(entry.unavailable, false);
  assert.equal(recapProgress(entry).percent, 80);
  assert.equal(f.creates.length, 0);
  f.tracker.stop();
});

test("failed generation preserves its percentage and retries the same project once", async () => {
  const f = fixture([1]);
  f.setLoad(async () => project(1, "failed", 65));
  f.tracker.start();
  await flush();
  assert.equal(recapProgress(f.tracker.getSnapshot().entries[0]).percent, 65);
  assert.equal(f.timers.size, 0);
  const pending = deferred<Project>();
  f.setLoad(() => pending.promise);
  const retry = f.tracker.retry(1);
  await f.tracker.retry(1);
  await retry;
  assert.deepEqual(f.retries, [1]);
  assert.equal(f.creates.length, 0);
  assert.equal(recapProgress(f.tracker.getSnapshot().entries[0]).percent, 0);
  f.tracker.clear();
  assert.equal(f.loads.at(-1)?.signal.aborted, true);
  assert.deepEqual(f.stored(), []);
  pending.resolve(project(1));
  await flush();
  assert.equal(f.tracker.getSnapshot().entries.length, 0);
});

test("creation failure never automatically resubmits and can be dismissed", async () => {
  const f = fixture();
  f.setCreate(async () => {
    throw new Error("Request failed");
  });
  f.tracker.start();
  await f.tracker.create("Recap", {});
  const entry = f.tracker.getSnapshot().entries[0];
  assert.equal(recapProgress(entry).failed, true);
  assert.equal(f.creates.length, 1);
  assert.equal(f.loads.length, 0);
  f.tracker.dismiss(entry.key);
  assert.equal(f.tracker.getSnapshot().entries.length, 0);
});

test("expired authentication clears tracking and aborts other requests", async () => {
  const f = fixture([1, 2]);
  const pending = deferred<Project>();
  f.setLoad((id) =>
    id === 1
      ? Promise.reject(
          Object.assign(new Error("Unauthenticated"), { status: 401 }),
        )
      : pending.promise,
  );
  f.tracker.start();
  await flush();
  assert.equal(f.tracker.getSnapshot().entries.length, 0);
  assert.ok(f.loads.every((request) => request.signal.aborted));
  assert.deepEqual(f.stored(), []);
  pending.resolve(project(2));
  await flush();
  assert.equal(f.tracker.getSnapshot().entries.length, 0);
});

test("legacy projects use statuses and reserve 100 percent for completion", () => {
  const entry = {
    key: "1",
    id: 1,
    title: "Recap",
    project: { ...project(), generation_progress: null },
    pending: false,
    error: null,
    unavailable: false,
  };
  assert.equal(recapProgress(entry).step, "downloading");
  assert.equal(recapProgress(entry).percent, 0);
  assert.equal(
    recapProgress({ ...entry, project: project(1, "processing", 100) }).percent,
    99,
  );
  assert.equal(
    recapProgress({ ...entry, project: project(1, "script_ready", 100) })
      .percent,
    100,
  );
});
