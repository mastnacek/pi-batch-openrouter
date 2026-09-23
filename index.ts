import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { BatchStorage } from "./src/storage.js";
import { BatchPoller } from "./src/poller.js";
import { registerBatchCommand } from "./src/commands.js";
import { registerBatchTools } from "./src/tools.js";

const unsubs: Array<() => void> = [];

export default function (pi: ExtensionAPI): void {
  const storage = new BatchStorage();

  const getApiKey = (): string => {
    // 1. Check environment variable
    if (typeof process !== "undefined" && process.env?.OPENROUTER_API_KEY) {
      return process.env.OPENROUTER_API_KEY;
    }
    return "";
  };

  let activeCtx: ExtensionContext | null = null;

  const poller = new BatchPoller(
    storage,
    getApiKey,
    (badgeText) => {
      if (activeCtx?.hasUI) {
        if (badgeText) {
          activeCtx.ui.setStatus("pi-batch", badgeText);
        } else {
          activeCtx.ui.setStatus("pi-batch", undefined);
        }
      }
    },
    (job) => {
      if (activeCtx?.hasUI) {
        activeCtx.ui.notify(
          `📦 Batch completed: ${job.title}\nSaved to: ${job.outputDir || "results"}\nInspect with /batch view`,
          "info"
        );
      }
    }
  );

  registerBatchCommand(pi, storage, poller, getApiKey);
  registerBatchTools(pi, storage, poller, getApiKey);

  unsubs.push(
    pi.on("session_start", (_event, ctx) => {
      activeCtx = ctx;
      poller.start();
      poller.updateBadge();
    })
  );

  unsubs.push(
    pi.on("session_shutdown", () => {
      poller.stop();
      while (unsubs.length > 0) {
        unsubs.pop()?.();
      }
    })
  );
}
