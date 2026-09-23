import { BatchStorage } from "./storage.js";
import { OpenRouterBatchClient, saveBatchResultsToDisk } from "./client.js";
import type { BatchJob } from "./types.js";

export type StatusChangeCallback = (badgeText: string, activeCount: number) => void;
export type BatchCompletedCallback = (job: BatchJob) => void;

interface GlobalWithTimers {
  setInterval?: (callback: () => void, ms?: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

export class BatchPoller {
  private timer: unknown = null;
  private isChecking = false;

  constructor(
    private storage: BatchStorage,
    private getApiKey: () => string,
    private onStatusChange?: StatusChangeCallback,
    private onBatchCompleted?: BatchCompletedCallback
  ) {}

  public start(): void {
    if (this.timer) return;
    const interval = Math.max(10000, this.storage.getConfig().pollIntervalMs);
    const timers = globalThis as GlobalWithTimers;
    if (typeof timers.setInterval === "function") {
      this.timer = timers.setInterval(() => {
        void this.checkNow();
      }, interval);
    }
    void this.checkNow();
  }

  public stop(): void {
    if (this.timer) {
      const timers = globalThis as GlobalWithTimers;
      if (typeof timers.clearInterval === "function") {
        timers.clearInterval(this.timer);
      }
      this.timer = null;
    }
  }

  public async checkNow(): Promise<void> {
    if (this.isChecking) return;
    this.isChecking = true;

    try {
      const activeJobs = this.storage.getActiveJobs();
      if (activeJobs.length === 0) {
        this.updateBadge();
        return;
      }

      const apiKey = this.getApiKey();
      if (!apiKey) {
        return;
      }

      const client = new OpenRouterBatchClient(apiKey);
      const config = this.storage.getConfig();

      for (const job of activeJobs) {
        try {
          const detail = await client.getBatch(job.id);
          const wasCompleted = job.status !== "completed" && detail.status === "completed";

          job.status = detail.status;
          job.totalRequests = detail.request_counts.total;
          job.completedRequests = detail.request_counts.completed;
          job.failedRequests = detail.request_counts.failed;
          job.finalizedAt = detail.finalized_at;
          job.costUsd = detail.usage?.cost;

          if (detail.status === "completed" && detail.results && !job.resultsSaved) {
            if (config.autoSaveResults) {
              const outDir = saveBatchResultsToDisk(job, detail.results, config.outputBaseDir);
              job.outputDir = outDir;
              job.resultsSaved = true;
            }
          }

          this.storage.saveJob(job);

          if (wasCompleted) {
            this.onBatchCompleted?.(job);
          }
        } catch {
          // Keep checking next jobs on single-job error
        }
      }

      this.updateBadge();
    } finally {
      this.isChecking = false;
    }
  }

  public updateBadge(): void {
    const active = this.storage.getActiveJobs();
    if (active.length === 0) {
      const all = this.storage.getJobs();
      const recentDone = all.find((j) => j.status === "completed" && Date.now() - (j.finalizedAt ?? j.createdAt) < 300000);
      if (recentDone) {
        this.onStatusChange?.("📦 Batch finished", 0);
      } else {
        this.onStatusChange?.("", 0);
      }
      return;
    }

    let completedSum = 0;
    let totalSum = 0;
    for (const j of active) {
      completedSum += j.completedRequests;
      totalSum += j.totalRequests;
    }

    const text = `📦 Batch: ${active.length} active (${completedSum}/${totalSum})`;
    this.onStatusChange?.(text, active.length);
  }
}
