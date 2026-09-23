import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { BatchStorage } from "./storage.js";
import type { BatchPoller } from "./poller.js";
import { OpenRouterBatchClient } from "./client.js";
import type { BatchJob } from "./types.js";

export function registerBatchTools(
  pi: ExtensionAPI,
  storage: BatchStorage,
  poller: BatchPoller,
  getApiKey: () => string
): void {
  pi.registerTool({
    name: "batch_submit_goal",
    label: "Batch Submit Goal",
    description: "Offloads a heavy autonomous coding or review goal to an OpenRouter Batch API job at 50% discount.",
    promptSnippet: "Use batch_submit_goal to run non-blocking heavy codebase audits, reviews, or long analyses.",
    promptGuidelines: [
      "Call batch_submit_goal when user wants an asynchronous or batch goal executed offline",
    ],
    parameters: Type.Object({
      prompt: Type.String({ description: "Detailed task instructions or goal prompt" }),
      model: Type.Optional(Type.String({ description: "OpenRouter model override (e.g. anthropic/claude-opus-5.5)" })),
      title: Type.Optional(Type.String({ description: "Short descriptive title for the batch job" })),
    }),
    execute: async (_toolCallId, params, signal) => {
      if (signal?.aborted) {
        throw new Error("Batch submission aborted");
      }

      const apiKey = getApiKey();
      if (!apiKey) {
        throw new Error("Missing OpenRouter API key. Set OPENROUTER_API_KEY environment variable.");
      }

      const model = params.model || storage.getConfig().defaultModel;
      const title = params.title || params.prompt.slice(0, 50);

      const client = new OpenRouterBatchClient(apiKey);
      const res = await client.submitBatch(model, [
        {
          custom_id: "batch-req-1",
          body: {
            messages: [
              {
                role: "system",
                content: "You are an expert autonomous software engineer executing an offline batch goal. Provide a thorough, structured, complete solution with all necessary code, architecture decisions, and diffs.",
              },
              {
                role: "user",
                content: params.prompt,
              },
            ],
            max_tokens: 16000,
          },
        },
      ]);

      const newJob: BatchJob = {
        id: res.id,
        title,
        model,
        status: res.status,
        createdAt: Date.now(),
        totalRequests: 1,
        completedRequests: 0,
        failedRequests: 0,
        resultsSaved: false,
        items: [
          {
            customId: "batch-req-1",
            prompt: params.prompt,
          },
        ],
      };

      storage.saveJob(newJob);
      poller.updateBadge();

      return {
        content: [
          {
            type: "text",
            text: `Batch job successfully queued.\nBatch ID: ${res.id}\nModel: ${model}\nStatus: ${res.status}\nResults will be saved to disk automatically upon completion. User can track progress with /batch view or /batch list.`,
          },
        ],
        details: { batchId: res.id, status: res.status, model },
      };
    },
  });

  pi.registerTool({
    name: "batch_check_jobs",
    label: "Batch Check Jobs",
    description: "Inspects status and results of recent or active OpenRouter batch jobs.",
    promptSnippet: "Use batch_check_jobs to see if an offloaded batch job has finished.",
    promptGuidelines: [
      "Call batch_check_jobs when user asks about batch status or progress",
    ],
    parameters: Type.Object({
      batch_id: Type.Optional(Type.String({ description: "Specific batch ID to query" })),
    }),
    execute: async (_toolCallId, params): Promise<{ content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> }> => {
      await poller.checkNow();
      poller.updateBadge();

      if (params.batch_id) {
        const job = storage.getJob(params.batch_id);
        if (!job) {
          throw new Error(`Batch job not found: ${params.batch_id}`);
        }
        return {
          content: [
            {
              type: "text",
              text: `Batch ID: ${job.id}\nStatus: ${job.status}\nProgress: ${job.completedRequests}/${job.totalRequests} completed (${job.failedRequests} failed)\nTitle: ${job.title}\nSaved to: ${job.outputDir || "pending"}`,
            },
          ],
          details: {
            queriedId: params.batch_id,
            found: true,
            jobStatus: job.status,
          },
        };
      }

      const jobs = storage.getJobs();
      const summary = jobs.map((j) => `- [${j.id}] (${j.status}) ${j.completedRequests}/${j.totalRequests}: ${j.title}`).join("\n");

      return {
        content: [
          {
            type: "text",
            text: `Recorded Batch Jobs (${jobs.length}):\n${summary || "None"}`,
          },
        ],
        details: {
          queriedId: "",
          found: false,
          totalJobs: jobs.length,
        },
      };
    },
  });
}
