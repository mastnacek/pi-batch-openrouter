import type { Component } from "@earendil-works/pi-tui";
import { matchesKey } from "@earendil-works/pi-tui";
import type { BatchJob } from "./types.js";

export class BatchDashboardComponent implements Component {
  private selectedIndex = 0;
  private isDetailed = false;

  constructor(
    private jobs: BatchJob[],
    private onDone: () => void,
    private onCancelJob?: (jobId: string) => Promise<void>,
    private onRefresh?: () => Promise<void>
  ) {}

  public invalidate(): void {
    // Component is rendered on demand
  }

  public updateJobs(jobs: BatchJob[]): void {
    this.jobs = jobs;
    if (this.selectedIndex >= this.jobs.length) {
      this.selectedIndex = Math.max(0, this.jobs.length - 1);
    }
  }

  public handleInput(data: string): void {
    if (matchesKey(data, "escape") || data === "q" || data === "Q") {
      this.onDone();
      return;
    }

    if (this.isDetailed) {
      if (matchesKey(data, "enter") || matchesKey(data, "escape") || data === "b") {
        this.isDetailed = false;
      }
      return;
    }

    if (matchesKey(data, "up") || data === "k") {
      if (this.selectedIndex > 0) this.selectedIndex--;
      return;
    }

    if (matchesKey(data, "down") || data === "j") {
      if (this.selectedIndex < this.jobs.length - 1) this.selectedIndex++;
      return;
    }

    if (matchesKey(data, "enter")) {
      if (this.jobs.length > 0) {
        this.isDetailed = true;
      }
      return;
    }

    if (data === "r" || data === "R") {
      void this.onRefresh?.();
      return;
    }

    if (data === "c" || data === "C") {
      const selected = this.jobs[this.selectedIndex];
      if (selected && (selected.status === "in_progress" || selected.status === "validating")) {
        void this.onCancelJob?.(selected.id);
      }
      return;
    }
  }

  public render(width: number): string[] {
    const lines: string[] = [];
    const hr = "─".repeat(Math.max(10, width));

    if (this.isDetailed) {
      return this.renderDetailView(width, hr);
    }

    lines.push(`\x1b[1;36m📦 OpenRouter Batch Jobs Dashboard\x1b[0m`);
    lines.push(hr);

    if (this.jobs.length === 0) {
      lines.push("  No batch jobs found. Use /batch goal <prompt> to submit one.");
      lines.push("");
      lines.push("\x1b[90m[Esc/q] Close\x1b[0m");
      return lines;
    }

    lines.push(`\x1b[90m  ID             Status        Progress   Model                      Title\x1b[0m`);
    lines.push(hr);

    for (let i = 0; i < this.jobs.length; i++) {
      const job = this.jobs[i]!;
      const isSelected = i === this.selectedIndex;
      const marker = isSelected ? "\x1b[36m▶\x1b[0m" : " ";
      const statusColor = this.getStatusColor(job.status);
      const idStr = job.id.slice(0, 12).padEnd(14);
      const statusStr = (statusColor + job.status.padEnd(13) + "\x1b[0m");
      const progStr = `${job.completedRequests}/${job.totalRequests}`.padEnd(10);
      const modelShort = job.model.replace("anthropic/", "").padEnd(26);
      const titleShort = job.title.slice(0, Math.max(10, width - 70));

      const row = `${marker} ${idStr} ${statusStr} ${progStr} ${modelShort} ${titleShort}`;
      if (isSelected) {
        lines.push(`\x1b[7m${row}\x1b[27m`);
      } else {
        lines.push(row);
      }
    }

    lines.push(hr);
    lines.push("\x1b[90m[↑/↓/j/k] Navigate  [Enter] Details  [c] Cancel active  [r] Refresh  [Esc/q] Close\x1b[0m");
    return lines;
  }

  private renderDetailView(width: number, hr: string): string[] {
    const job = this.jobs[this.selectedIndex];
    if (!job) {
      this.isDetailed = false;
      return this.render(width);
    }

    const lines: string[] = [];
    lines.push(`\x1b[1;36m📦 Batch Detail: ${job.id}\x1b[0m`);
    lines.push(hr);
    lines.push(`  Title:      ${job.title}`);
    lines.push(`  Model:      ${job.model}`);
    lines.push(`  Status:     ${this.getStatusColor(job.status)}${job.status}\x1b[0m`);
    lines.push(`  Progress:   ${job.completedRequests}/${job.totalRequests} completed (${job.failedRequests} failed)`);
    lines.push(`  Created:    ${new Date(job.createdAt).toLocaleString()}`);
    if (job.finalizedAt) {
      lines.push(`  Finalized:  ${new Date(job.finalizedAt).toLocaleString()}`);
    }
    if (job.costUsd !== undefined) {
      lines.push(`  Cost:       $${job.costUsd.toFixed(4)}`);
    }
    if (job.outputDir) {
      lines.push(`  Output dir: ${job.outputDir}`);
    }

    lines.push(hr);
    lines.push(`  Items (${job.items.length}):`);
    for (const it of job.items.slice(0, 5)) {
      lines.push(`  - [${it.customId}] Prompt: ${it.prompt.slice(0, Math.max(10, width - 30)).replace(/\n/g, " ")}`);
    }
    if (job.items.length > 5) {
      lines.push(`    ... and ${job.items.length - 5} more items`);
    }

    lines.push(hr);
    lines.push("\x1b[90m[Enter/b/Esc] Back to dashboard\x1b[0m");
    return lines;
  }

  private getStatusColor(status: BatchJob["status"]): string {
    switch (status) {
      case "completed":
        return "\x1b[32m";
      case "in_progress":
      case "validating":
      case "finalizing":
        return "\x1b[33m";
      case "failed":
      case "expired":
        return "\x1b[31m";
      case "cancelled":
        return "\x1b[90m";
      default:
        return "\x1b[0m";
    }
  }
}
