import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import type { BatchStorage } from "./storage.js";
import type { BatchPoller } from "./poller.js";
import { OpenRouterBatchClient } from "./client.js";
import { BatchDashboardComponent } from "./dashboard.js";
import type { BatchJob } from "./types.js";

const SUBCOMMANDS: Record<string, { desc: string; nonTerminal: boolean }> = {
  view: { desc: "Open interactive TUI dashboard", nonTerminal: false },
  list: { desc: "List recent batches in terminal", nonTerminal: false },
  goal: { desc: "Submit an asynchronous goal prompt", nonTerminal: false },
  check: { desc: "Trigger immediate status poll", nonTerminal: false },
  cancel: { desc: "Cancel a running batch job", nonTerminal: true },
  model: { desc: "Set or inspect default batch model", nonTerminal: true },
};

const POPULAR_BATCH_MODELS = [
  "anthropic/claude-opus-5.5",
  "anthropic/claude-sonnet-4.5",
  "openai/gpt-5-mini",
  "openai/gpt-4o",
  "deepseek/deepseek-r1",
];

export function registerBatchCommand(
  pi: ExtensionAPI,
  storage: BatchStorage,
  poller: BatchPoller,
  getApiKey: () => string
): void {
  pi.registerCommand("batch", {
    description: "Manage OpenRouter asynchronous batch jobs & goals",
    getArgumentCompletions: async (prefix: string): Promise<AutocompleteItem[] | null> => {
      const tokens = prefix.split(/\s+/).filter(Boolean);
      const trailingSpace = /\s$/.test(prefix);
      const normalizedPrefix = tokens.join(" ").toLowerCase();
      const firstToken = tokens[0]?.toLowerCase();

      const NON_TERMINAL = new Set(["cancel", "model"]);

      if (
        tokens.length > 1 ||
        (trailingSpace && tokens.length === 1) ||
        (tokens.length === 1 && firstToken !== undefined && NON_TERMINAL.has(firstToken))
      ) {
        const cmd = firstToken;

        if (cmd === "cancel") {
          const active = storage.getActiveJobs();
          const items = active.map((j) => ({
            value: `cancel ${j.id}`,
            label: j.id,
            description: `${j.title.slice(0, 30)} (${j.status})`,
          }));
          const filtered = items.filter((i) => i.value.toLowerCase().startsWith(normalizedPrefix));
          return filtered.length > 0 ? filtered : null;
        }

        if (cmd === "model") {
          const current = storage.getConfig().defaultModel;
          const items = POPULAR_BATCH_MODELS.map((m) => {
            const isActive = m === current;
            return {
              value: `model ${m}`,
              label: isActive ? `${m} ✓` : m,
              description: isActive ? `Set batch model · ● AKTIVNÍ` : `Set batch model`,
            };
          });
          const filtered = items.filter((i) => i.value.toLowerCase().startsWith(normalizedPrefix));
          return filtered.length > 0 ? filtered : null;
        }

        return null;
      }

      // First token completion
      const typed = (tokens[0] ?? "").toLowerCase();
      const items: AutocompleteItem[] = [];

      for (const [name, meta] of Object.entries(SUBCOMMANDS)) {
        if (name.toLowerCase().startsWith(typed)) {
          items.push({
            value: meta.nonTerminal ? `${name} ` : name,
            label: name,
            description: meta.desc,
          });
        }
      }

      return items.length > 0 ? items : null;
    },

    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const tokens = args.trim().split(/\s+/);
      const sub = tokens[0]?.toLowerCase() || "view";
      const rest = tokens.slice(1).join(" ").trim();

      if (sub === "view" || sub === "ui" || sub === "dashboard") {
        if (!ctx.hasUI) {
          ctx.ui.notify("UI is not available in headless mode. Use /batch list instead.", "warning");
          return;
        }

        const jobs = storage.getJobs();
        await ctx.ui.custom((_tui, _theme, _keybindings, onDone) => {
          const comp = new BatchDashboardComponent(
            jobs,
            () => onDone(undefined),
            async (jobId: string) => {
              const apiKey = getApiKey();
              if (!apiKey) {
                ctx.ui.notify("Missing API key", "error");
                return;
              }
              const client = new OpenRouterBatchClient(apiKey);
              try {
                await client.cancelBatch(jobId);
                ctx.ui.notify(`Batch ${jobId} cancellation requested`, "info");
                await poller.checkNow();
                comp.updateJobs(storage.getJobs());
                _tui.requestRender();
              } catch (err) {
                ctx.ui.notify(`Failed to cancel: ${String(err)}`, "error");
              }
            },
            async () => {
              await poller.checkNow();
              comp.updateJobs(storage.getJobs());
              _tui.requestRender();
            }
          );
          return comp;
        });
        return;
      }

      if (sub === "list") {
        const jobs = storage.getJobs();
        if (jobs.length === 0) {
          ctx.ui.notify("No batch jobs recorded.", "info");
          return;
        }

        const lines = [
          "📦 OpenRouter Batch Jobs:",
          "ID             Status        Progress   Model              Title",
          "─".repeat(75),
        ];

        for (const j of jobs) {
          const id = j.id.slice(0, 12).padEnd(14);
          const st = j.status.padEnd(13);
          const pr = `${j.completedRequests}/${j.totalRequests}`.padEnd(10);
          const md = j.model.replace("anthropic/", "").padEnd(18);
          const ti = j.title.slice(0, 30);
          lines.push(`${id} ${st} ${pr} ${md} ${ti}`);
        }
        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      if (sub === "check") {
        ctx.ui.notify("Checking batch statuses...", "info");
        await poller.checkNow();
        poller.updateBadge();
        return;
      }

      if (sub === "model") {
        if (!rest) {
          const curr = storage.getConfig().defaultModel;
          ctx.ui.notify(`Current default batch model: ${curr}`, "info");
          return;
        }
        storage.updateConfig({ defaultModel: rest });
        ctx.ui.notify(`Default batch model set to: ${rest}`, "info");
        return;
      }

      if (sub === "cancel") {
        if (!rest) {
          ctx.ui.notify("Usage: /batch cancel <batch_id>", "error");
          return;
        }
        const apiKey = getApiKey();
        if (!apiKey) {
          ctx.ui.notify("Missing OpenRouter API key", "error");
          return;
        }
        try {
          const client = new OpenRouterBatchClient(apiKey);
          await client.cancelBatch(rest);
          const job = storage.getJob(rest);
          if (job) {
            job.status = "cancelled";
            storage.saveJob(job);
          }
          ctx.ui.notify(`Batch ${rest} cancelled`, "info");
          await poller.checkNow();
        } catch (err) {
          ctx.ui.notify(`Error cancelling batch: ${String(err)}`, "error");
        }
        return;
      }

      if (sub === "goal") {
        if (!rest) {
          ctx.ui.notify("Usage: /batch goal <prompt / description>", "error");
          return;
        }
        const apiKey = getApiKey();
        if (!apiKey) {
          ctx.ui.notify("Missing OpenRouter API key. Please export OPENROUTER_API_KEY.", "error");
          return;
        }

        const model = storage.getConfig().defaultModel;
        const client = new OpenRouterBatchClient(apiKey);

        ctx.ui.notify(`Submitting batch goal using ${model}...`, "info");

        try {
          const res = await client.submitBatch(model, [
            {
              custom_id: "goal-1",
              body: {
                messages: [
                  {
                    role: "system",
                    content: "You are an expert autonomous software engineer executing an offline batch goal. Provide a thorough, structured, complete solution with all necessary code, architecture decisions, and diffs.",
                  },
                  {
                    role: "user",
                    content: rest,
                  },
                ],
                max_tokens: 16000,
              },
            },
          ]);

          const newJob: BatchJob = {
            id: res.id,
            title: rest.slice(0, 60),
            model,
            status: res.status,
            createdAt: Date.now(),
            totalRequests: 1,
            completedRequests: 0,
            failedRequests: 0,
            resultsSaved: false,
            items: [
              {
                customId: "goal-1",
                prompt: rest,
              },
            ],
          };

          storage.saveJob(newJob);
          poller.updateBadge();
          ctx.ui.notify(`✅ Batch goal submitted!\nID: ${res.id}\nTrack status with /batch view`, "info");
        } catch (err) {
          ctx.ui.notify(`Failed to submit batch: ${String(err)}`, "error");
        }
        return;
      }

      ctx.ui.notify(`Unknown subcommand: ${sub}. See /batch view | list | goal | check | cancel | model`, "warning");
    },
  });
}
