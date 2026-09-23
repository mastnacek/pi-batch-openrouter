import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DEFAULT_CONFIG, type BatchJob, type BatchPluginConfig } from "./types.js";

const STATE_DIR = path.join(os.homedir(), ".pi", "agent", "pi-batch-openrouter");
const CONFIG_FILE = path.join(STATE_DIR, "config.json");
const JOBS_FILE = path.join(STATE_DIR, "jobs.json");

function atomicWriteJson(filePath: string, data: unknown): void {
  const tmp = `${filePath}.tmp.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

export class BatchStorage {
  private config: BatchPluginConfig;
  private jobs: Map<string, BatchJob> = new Map();

  constructor() {
    this.config = this.loadConfig();
    this.loadJobs();
  }

  public getConfig(): BatchPluginConfig {
    return { ...this.config };
  }

  public updateConfig(update: Partial<BatchPluginConfig>): void {
    this.config = { ...this.config, ...update };
    this.saveConfig();
  }

  public getJobs(): BatchJob[] {
    return Array.from(this.jobs.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  public getJob(id: string): BatchJob | undefined {
    return this.jobs.get(id);
  }

  public saveJob(job: BatchJob): void {
    this.jobs.set(job.id, job);
    this.persistJobs();
  }

  public deleteJob(id: string): boolean {
    const deleted = this.jobs.delete(id);
    if (deleted) this.persistJobs();
    return deleted;
  }

  public getActiveJobs(): BatchJob[] {
    return this.getJobs().filter(
      (j) => j.status === "validating" || j.status === "in_progress" || j.status === "finalizing"
    );
  }

  private loadConfig(): BatchPluginConfig {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, "utf8");
        return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      }
    } catch {
      // ignore
    }
    return { ...DEFAULT_CONFIG };
  }

  private saveConfig(): void {
    try {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      atomicWriteJson(CONFIG_FILE, this.config);
    } catch {
      // ignore
    }
  }

  private loadJobs(): void {
    try {
      if (fs.existsSync(JOBS_FILE)) {
        const raw = fs.readFileSync(JOBS_FILE, "utf8");
        const list = JSON.parse(raw) as BatchJob[];
        this.jobs.clear();
        for (const j of list) {
          this.jobs.set(j.id, j);
        }
      }
    } catch {
      // ignore
    }
  }

  private persistJobs(): void {
    try {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      atomicWriteJson(JOBS_FILE, Array.from(this.jobs.values()));
    } catch {
      // ignore
    }
  }
}
