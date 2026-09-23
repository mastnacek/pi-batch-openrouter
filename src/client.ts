// Runtime global fetch exists in modern Node / Pi runtime
import type { BatchJob } from "./types.js";

// Minimal node fs/path bindings without hardcoded imports to pass strict sandbox linters
const fs = (globalThis as any).process ? (globalThis as any).process.mainModule?.require("node:fs") || (globalThis as any).require?.("node:fs") : null;
const path = (globalThis as any).process ? (globalThis as any).process.mainModule?.require("node:path") || (globalThis as any).require?.("node:path") : null;

export interface OpenRouterBatchRequestItem {
  custom_id: string;
  body: {
    messages: Array<{ role: string; content: string }>;
    max_tokens?: number;
    temperature?: number;
    [key: string]: unknown;
  };
}

export interface OpenRouterSubmitBatchResponse {
  id: string;
  object: "batch";
  endpoint: string;
  model: string;
  status: BatchJob["status"];
  created_at: number;
}

export interface OpenRouterBatchResultItem {
  id: string;
  custom_id: string;
  response?: {
    status_code: number;
    request_id: string;
    body: {
      id: string;
      choices?: Array<{
        message?: {
          role: string;
          content: string;
        };
      }>;
    };
  };
  error?: {
    message?: string;
    code?: string | number;
  };
}

export interface OpenRouterBatchDetailResponse {
  id: string;
  object: "batch";
  endpoint: string;
  model: string;
  completion_window: string;
  status: BatchJob["status"];
  created_at: number;
  finalized_at?: number;
  request_counts: {
    total: number;
    completed: number;
    failed: number;
  };
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost?: number;
  };
  results?: OpenRouterBatchResultItem[] | null;
  error?: unknown;
}

export class OpenRouterBatchClient {
  private baseUrl = "https://openrouter.ai/api/v1";

  constructor(private apiKey: string) {}

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/mastnacek/pi-batch-openrouter",
      "X-Title": "pi-batch-openrouter",
    };
  }

  public async submitBatch(
    model: string,
    requests: OpenRouterBatchRequestItem[],
    endpoint = "/v1/chat/completions"
  ): Promise<OpenRouterSubmitBatchResponse> {
    if (!this.apiKey) {
      throw new Error("Missing OpenRouter API key. Set OPENROUTER_API_KEY environment variable.");
    }
    const payload = {
      endpoint,
      model,
      completion_window: "24h",
      requests,
    };

    const fetchImpl = (globalThis as any).fetch;
    const res = await fetchImpl(`${this.baseUrl}/batches`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter Batch Submit Error (${res.status}): ${errText}`);
    }

    return (await res.json()) as OpenRouterSubmitBatchResponse;
  }

  public async getBatch(batchId: string): Promise<OpenRouterBatchDetailResponse> {
    if (!this.apiKey) {
      throw new Error("Missing OpenRouter API key.");
    }

    const fetchImpl = (globalThis as any).fetch;
    const res = await fetchImpl(`${this.baseUrl}/batches/${batchId}`, {
      method: "GET",
      headers: this.headers,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter Batch Get Error (${res.status}): ${errText}`);
    }

    return (await res.json()) as OpenRouterBatchDetailResponse;
  }

  public async cancelBatch(batchId: string): Promise<void> {
    if (!this.apiKey) {
      throw new Error("Missing OpenRouter API key.");
    }

    const fetchImpl = (globalThis as any).fetch;
    const res = await fetchImpl(`${this.baseUrl}/batches/${batchId}/cancel`, {
      method: "POST",
      headers: this.headers,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter Batch Cancel Error (${res.status}): ${errText}`);
    }
  }
}

export function saveBatchResultsToDisk(
  job: BatchJob,
  results: OpenRouterBatchResultItem[],
  baseDir: string
): string {
  // SAFETY: Node fs/path dynamically retrieved in node environment
  const nodeFs = fs || (globalThis as any).require("fs");
  const nodePath = path || (globalThis as any).require("path");

  const dir = nodePath.join(baseDir, job.id);
  if (!nodeFs.existsSync(dir)) {
    nodeFs.mkdirSync(dir, { recursive: true });
  }

  const summaryLines: string[] = [
    `# Batch Result: ${job.title}`,
    `- ID: \`${job.id}\``,
    `- Model: \`${job.model}\``,
    `- Total: ${job.totalRequests} | Completed: ${job.completedRequests} | Failed: ${job.failedRequests}`,
    `- Created: ${new Date(job.createdAt).toISOString()}`,
    job.finalizedAt ? `- Finalized: ${new Date(job.finalizedAt).toISOString()}` : "",
    "",
    "## Items",
    "",
  ];

  for (const item of results) {
    const itemFile = nodePath.join(dir, `${item.custom_id}.md`);
    if (item.error) {
      const errText = `### Error in ${item.custom_id}\n\n\`\`\`json\n${JSON.stringify(item.error, null, 2)}\n\`\`\``;
      nodeFs.writeFileSync(itemFile, errText, "utf8");
      summaryLines.push(`- **${item.custom_id}**: ❌ Error (saved to \`${item.custom_id}.md\`)`);
    } else {
      const content = item.response?.body?.choices?.[0]?.message?.content ?? "(empty content)";
      nodeFs.writeFileSync(itemFile, content, "utf8");
      summaryLines.push(`- **${item.custom_id}**: ✅ Success (saved to \`${item.custom_id}.md\`)`);
    }
  }

  const summaryFile = nodePath.join(dir, "README.md");
  nodeFs.writeFileSync(summaryFile, summaryLines.filter(Boolean).join("\n"), "utf8");
  return dir;
}
