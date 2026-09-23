import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { BatchStorage } from "./src/storage.js";
import { BatchPoller } from "./src/poller.js";
import { registerBatchCommand } from "./src/commands.js";
import { registerBatchTools } from "./src/tools.js";
import { resolveApiKeyForProvider } from "./src/models.js";

const unsubs: Array<() => void> = [];

export default function (pi: ExtensionAPI): void {
  const storage = new BatchStorage();

  let activeCtx: ExtensionContext | null = null;

  const poller = new BatchPoller(
    storage,
    async (job) => {
      if (!activeCtx) return "";
      return resolveApiKeyForProvider(activeCtx, job.provider);
    },
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
          `📦 Batch completed: ${job.title} [${job.provider}]\nSaved to: ${job.outputDir || "results"}\nInspect with /batch view`,
          "info"
        );
      }
    }
  );

  registerBatchCommand(pi, storage, poller, () => activeCtx);
  registerBatchTools(pi, storage, poller, () => activeCtx);

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
