import type { Project } from "./api";

export type RecapEntry = {
  key: string;
  id: number | null;
  title: string;
  project: Project | null;
  pending: boolean;
  error: string | null;
  unavailable: boolean;
};

export type RecapSnapshot = {
  entries: RecapEntry[];
  selected: string | null;
};

type Dependencies = {
  create: (data: unknown, signal: AbortSignal) => Promise<Project>;
  load: (id: number, signal: AbortSignal) => Promise<Project>;
  retry: (id: number, signal: AbortSignal) => Promise<Project>;
  readIds: () => unknown;
  saveIds: (ids: number[]) => void;
  schedule: (callback: () => void) => ReturnType<typeof setTimeout>;
  cancel: (timer: ReturnType<typeof setTimeout>) => void;
};

export function recapProgress(entry: RecapEntry) {
  const project = entry.project;
  const failed = project?.status === "failed" || (!entry.id && !!entry.error);
  const complete =
    !!project &&
    ["script_ready", "audio_ready", "ready"].includes(project.status);
  const progress = project?.generation_progress;
  const step = complete
    ? "complete"
    : (progress?.step ??
      (project?.status === "processing"
        ? project.transcript
          ? "writing"
          : "downloading"
        : "queued"));
  return {
    failed,
    complete,
    step,
    percent: complete ? 100 : Math.min(99, Math.max(0, progress?.percent ?? 0)),
    active: !failed && !complete,
  };
}

export function storedRecapIds(value: unknown): number[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (id): id is number => Number.isSafeInteger(id) && id > 0,
          ),
        ),
      ]
    : [];
}

export class RecapTracker {
  private snapshot: RecapSnapshot = { entries: [], selected: null };
  private listeners = new Set<() => void>();
  private requests = new Map<string, AbortController>();
  private timers = new Map<number, ReturnType<typeof setTimeout>>();
  private stopped = true;
  private sequence = 0;

  constructor(private readonly dependencies: Dependencies) {}

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish(entries: RecapEntry[], selected = this.snapshot.selected) {
    this.snapshot = { entries, selected };
    this.dependencies.saveIds(
      entries.flatMap((entry) => (entry.id ? [entry.id] : [])),
    );
    this.listeners.forEach((listener) => listener());
  }

  private update(key: string, patch: Partial<RecapEntry>) {
    this.publish(
      this.snapshot.entries.map((entry) =>
        entry.key === key ? { ...entry, ...patch } : entry,
      ),
    );
  }

  start = () => {
    this.stopped = false;
    const entries = [...this.snapshot.entries];
    for (const id of storedRecapIds(this.dependencies.readIds())) {
      if (!entries.some((entry) => entry.id === id)) {
        entries.push({
          key: String(id),
          id,
          title: "",
          project: null,
          pending: false,
          error: null,
          unavailable: false,
        });
      }
    }
    this.publish(entries);
    entries.forEach((entry) => {
      if (entry.id) void this.check(entry.id);
    });
  };

  stop = () => {
    this.stopped = true;
    this.requests.forEach((request) => request.abort());
    this.requests.clear();
    this.timers.forEach(this.dependencies.cancel);
    this.timers.clear();
  };

  clear = () => {
    this.stop();
    this.publish([], null);
  };

  select = (key: string | null) => {
    this.publish(this.snapshot.entries, key);
  };

  dismiss = (key: string) => {
    const entry = this.snapshot.entries.find((entry) => entry.key === key);
    if (!entry || entry.pending || recapProgress(entry).active) return;
    this.publish(
      this.snapshot.entries.filter((entry) => entry.key !== key),
      this.snapshot.selected === key ? null : this.snapshot.selected,
    );
  };

  create = async (title: string, data: unknown) => {
    const key = `creating:${++this.sequence}`;
    const request = new AbortController();
    this.requests.set(key, request);
    this.publish(
      [
        ...this.snapshot.entries,
        {
          key,
          id: null,
          title,
          project: null,
          pending: true,
          error: null,
          unavailable: false,
        },
      ],
      key,
    );
    try {
      const project = await this.dependencies.create(data, request.signal);
      if (this.requests.get(key) !== request || this.stopped) return;
      const nextKey = String(project.id);
      this.publish(
        this.snapshot.entries.map((entry) =>
          entry.key === key
            ? {
                ...entry,
                key: nextKey,
                id: project.id,
                project,
                pending: false,
              }
            : entry,
        ),
        this.snapshot.selected === key ? nextKey : this.snapshot.selected,
      );
      void this.check(project.id);
    } catch (error) {
      if (this.requests.get(key) === request && !this.stopped)
        this.update(key, {
          pending: false,
          error: error instanceof Error ? error.message : String(error),
        });
    } finally {
      if (this.requests.get(key) === request) this.requests.delete(key);
    }
  };

  check = async (id: number) => {
    const key = String(id);
    const entry = this.snapshot.entries.find((entry) => entry.id === id);
    if (this.stopped || !entry || entry.pending || this.requests.has(key))
      return;
    const timer = this.timers.get(id);
    if (timer) this.dependencies.cancel(timer);
    this.timers.delete(id);
    const request = new AbortController();
    this.requests.set(key, request);
    this.update(key, { unavailable: false, error: null });
    try {
      const project = await this.dependencies.load(id, request.signal);
      if (this.requests.get(key) !== request || this.stopped) return;
      const updated = {
        ...entry,
        title: project.title,
        project,
        unavailable: false,
        error: null,
      };
      this.update(key, updated);
      if (recapProgress(updated).active)
        this.timers.set(
          id,
          this.dependencies.schedule(() => {
            void this.check(id);
          }),
        );
    } catch (error) {
      if (this.requests.get(key) !== request || this.stopped) return;
      const status = (error as { status?: number })?.status;
      if (status === 401) this.clear();
      else if (status === 404)
        this.publish(
          this.snapshot.entries.filter((entry) => entry.key !== key),
          this.snapshot.selected === key ? null : this.snapshot.selected,
        );
      else
        this.update(key, {
          unavailable: true,
          error: error instanceof Error ? error.message : String(error),
        });
    } finally {
      if (this.requests.get(key) === request) this.requests.delete(key);
    }
  };

  retry = async (id: number) => {
    const key = String(id);
    const entry = this.snapshot.entries.find((entry) => entry.key === key);
    if (this.stopped || !entry || entry.pending || this.requests.has(key))
      return;
    const request = new AbortController();
    this.requests.set(key, request);
    this.update(key, { pending: true, error: null, unavailable: false });
    try {
      const project = await this.dependencies.retry(id, request.signal);
      if (this.requests.get(key) !== request || this.stopped) return;
      this.update(key, { project, pending: false });
      this.requests.delete(key);
      void this.check(id);
    } catch (error) {
      if (this.requests.get(key) === request && !this.stopped)
        this.update(key, {
          pending: false,
          error: error instanceof Error ? error.message : String(error),
        });
    } finally {
      if (this.requests.get(key) === request) this.requests.delete(key);
    }
  };
}
