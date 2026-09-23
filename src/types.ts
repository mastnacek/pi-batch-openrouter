export interface BatchJobItem {
  customId: string;
  prompt: string;
  response?: string;
  error?: string;
}

export interface BatchJob {
  id: string;
  title: string;
  model: string;
  provider: string; // e.g. "openrouter", "openrouter-default", "openrouter-soukr"
  status: "validating" | "in_progress" | "finalizing" | "completed" | "failed" | "expired" | "cancelled";
  createdAt: number;
  finalizedAt?: number;
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  costUsd?: number;
  outputDir?: string;
  resultsSaved: boolean;
  items: BatchJobItem[];
}

export interface BatchPluginConfig {
  defaultProvider: string;
  defaultModel: string;
  pollIntervalMs: number;
  autoSaveResults: boolean;
  notifyOnComplete: boolean;
  outputBaseDir: string;
}

export const DEFAULT_CONFIG: BatchPluginConfig = {
  defaultProvider: "openrouter",
  defaultModel: "anthropic/claude-opus-5.5",
  pollIntervalMs: 60000,
  autoSaveResults: true,
  notifyOnComplete: true,
  outputBaseDir: "docs/batches",
};
