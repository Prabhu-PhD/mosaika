/**
 * Single-flight async mutation queue (Rule 6).
 * Serializes all IBentoHost mutations so rapid slider drags never commit out of order.
 */
export class SingleFlightQueue {
  private chain: Promise<void> = Promise.resolve();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingDebouncedTask: (() => Promise<void>) | null = null;

  public enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(task, task);
    this.chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  public scheduleDebounced(delayMs: number, task: () => Promise<void>): void {
    this.pendingDebouncedTask = task;
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      const toRun = this.pendingDebouncedTask;
      this.pendingDebouncedTask = null;
      if (toRun) {
        void this.enqueue(toRun);
      }
    }, delayMs);
  }

  public flushDebounced(overrideTask?: () => Promise<void>): Promise<void> {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    const toRun = overrideTask ?? this.pendingDebouncedTask;
    this.pendingDebouncedTask = null;
    if (!toRun) {
      return this.chain;
    }
    return this.enqueue(toRun);
  }

  public cancelDebounced(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingDebouncedTask = null;
  }
}
