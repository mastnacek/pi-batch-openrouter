import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Model, Api } from "@earendil-works/pi-ai";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface BatchModelOption {
  provider: string;
  modelId: string;
  displayName: string;
  isBatchNative: boolean;
}

/**
 * Checks if a model ID or name represents a batch model
 */
export function isBatchModel(m: Model<Api>): boolean {
  const idLower = m.id.toLowerCase();
  const nameLower = (m.name || "").toLowerCase();
  return idLower.includes(":batch") || idLower.includes("batch") || nameLower.includes("(batch)") || nameLower.includes("batch");
}

/**
 * Strips the ":batch" suffix for OpenRouter batch API payload
 * OpenRouter Batch API takes base model name (e.g. anthropic/claude-opus-5.5)
 */
export function normalizeBatchModelSlug(modelId: string): string {
  if (modelId.endsWith(":batch")) {
    return modelId.slice(0, -6);
  }
  return modelId;
}

/**
 * Discovers all batch-capable models from Pi's active ModelRegistry across all OpenRouter providers
 */
export function discoverBatchModels(ctx: ExtensionContext): BatchModelOption[] {
  const results: BatchModelOption[] = [];
  const allModels = ctx.modelRegistry.getAll();

  for (const m of allModels) {
    const isOrProvider = m.provider === "openrouter" || m.provider.startsWith("openrouter-");
    if (!isOrProvider) continue;

    if (isBatchModel(m)) {
      results.push({
        provider: m.provider,
        modelId: m.id,
        displayName: `${m.name || m.id} [${m.provider}]`,
        isBatchNative: true,
      });
    }
  }

  // If no explicit ':batch' models were in local cache yet, provide standard OpenRouter models under available OR providers
  if (results.length === 0) {
    const orProviders = new Set<string>();
    for (const m of allModels) {
      if (m.provider === "openrouter" || m.provider.startsWith("openrouter-")) {
        orProviders.add(m.provider);
      }
    }
    if (orProviders.size === 0) orProviders.add("openrouter");

    const fallbackSlugs = [
      "anthropic/claude-opus-5.5",
      "anthropic/claude-sonnet-4.5",
      "openai/gpt-5-mini",
      "openai/gpt-4o",
      "deepseek/deepseek-r1",
    ];

    for (const p of orProviders) {
      for (const slug of fallbackSlugs) {
        results.push({
          provider: p,
          modelId: slug,
          displayName: `${slug} [${p}]`,
          isBatchNative: false,
        });
      }
    }
  }

  return results;
}

/**
 * Resolves the API key for a specific OpenRouter provider (e.g., "openrouter", "openrouter-default", "openrouter-soukr")
 */
export async function resolveApiKeyForProvider(ctx: ExtensionContext, provider: string): Promise<string> {
  // 1. Try ctx.modelRegistry.getApiKeyForProvider
  try {
    const key = await ctx.modelRegistry.getApiKeyForProvider(provider);
    if (key) return key;
  } catch {
    // continue fallback
  }

  // 2. Read from ~/.pi/agent/auth.json directly
  try {
    const authFile = join(homedir(), ".pi", "agent", "auth.json");
    if (existsSync(authFile)) {
      const auth = JSON.parse(readFileSync(authFile, "utf8")) as Record<string, { key?: string; access?: string }>;
      const entry = auth[provider] || auth["openrouter"];
      if (entry?.key) return entry.key;
      if (entry?.access) return entry.access;
    }
  } catch {
    // continue fallback
  }

  // 3. Fallback to process.env
  if (typeof process !== "undefined" && process.env?.OPENROUTER_API_KEY) {
    return process.env.OPENROUTER_API_KEY;
  }

  return "";
}
