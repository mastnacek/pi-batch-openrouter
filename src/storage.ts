import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DEFAULT_CONFIG, type BatchJob, type BatchPluginConfig } from "./types.js";

const STATE_DIR = path.join(os.homedir(), ".pi", "agent", "pi-batch-openrouter");
/** Global layer: ~/.pi/agent/pi-batch-openrouter/config.json */
const GLOBAL_CONFIG_FILE = path.join(STATE_DIR, "config.json");
const CONFIG_FILE = GLOBAL_CONFIG_FILE;
const JOBS_FILE = path.join(STATE_DIR, "jobs.json");

/** Project override: <cwd>/.pi/pi-batch-openrouter.json (wins over the global file). */
export function projectConfigPath(cwd: string): string {
  return path.join(cwd, ".pi", "pi-batch-openrouter.json");
}

function atomicWriteJson(filePath: string, data: unknown): void {
  const tmp = `${filePath}.tmp.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

export class BatchStorage {
  private config: BatchPluginConfig;
  private jobs: Map<string, BatchJob> = new Map();
  /** Session cwd the config cascade hangs off; unset = global layer only. */
  private cwd: string | undefined;

  constructor() {
    this.config = this.loadConfig();
    this.loadJobs();
  }

  /** Rebind the cascade to a session's project layer and reload the config. */
  public setCwd(cwd?: string): void {
    this.cwd = cwd;
    this.config = this.loadConfig();
  }

  public getConfig(): BatchPluginConfig {
    return { ...this.config };
  }

  /** `--global` (isGlobal) writes the global layer, otherwise <cwd>/.pi/. */
  public updateConfig(update: Partial<BatchPluginConfig>, isGlobal = false): void {
    this.config = { ...this.config, ...update };
    this.saveConfig(isGlobal);
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

  /** Cascade: defaults <- ~/.pi/agent/pi-batch-openrouter/config.json <- <cwd>/.pi/. */
  private loadConfig(): BatchPluginConfig {
    const merged = { ...DEFAULT_CONFIG, ...this.readConfigLayer(CONFIG_FILE) };
    if (this.cwd) Object.assign(merged, this.readConfigLayer(projectConfigPath(this.cwd)));
    return merged;
  }

  private readConfigLayer(file: string): Partial<BatchPluginConfig> {
    try {
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, "utf8")) as Partial<BatchPluginConfig>;
      }
    } catch {
      // Corrupt layer — fall through.
    }
    return {};
  }

  private saveConfig(isGlobal = false): void {
    const target = isGlobal || !this.cwd ? GLOBAL_CONFIG_FILE : projectConfigPath(this.cwd);
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      atomicWriteJson(target, this.config);
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
