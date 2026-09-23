# pi-batch-openrouter

Deterministic OpenRouter Batch API manager for the Pi coding agent.
Offload heavy coding, auditing, architecture review, or reasoning goals to OpenRouter asynchronous Batch API at a **50% discount** (e.g. `anthropic/claude-opus-5.5` at $2/$10 per M tokens instead of $4/$20).

## Features

- **Asynchronous Goals**: Dispatch heavy goals via `/batch goal <prompt>` or tool call `batch_submit_goal`.
- **Statusline Integration**: Active batch jobs shown in the Pi statusline badge (e.g., `📦 Batch: 2 active (15/30)`).
- **Interactive TUI Dashboard**: Launch `/batch view` for full keyboard-navigable modal screen (`↑`/`↓` navigate, `Enter` inspect prompt & details, `c` cancel job, `r` refresh).
- **Automatic Retrieval**: When batches finish, results are automatically saved to disk under `docs/batches/<batch_id>/` with per-item markdown files and a summary `README.md`.
- **Slash Commands with Lazy Autocomplete**: Follows the Trailing Space Contract (`/batch view`, `/batch list`, `/batch goal`, `/batch check`, `/batch cancel`, `/batch model`).

## Installation

Add to your `~/.pi/agent/settings.json` or `.pi/settings.json`:

```json
{
  "packages": [
    "git:github.com/mastnacek/pi-batch-openrouter"
  ]
}
```

Ensure `OPENROUTER_API_KEY` is exported in your environment.

## Usage

### Slash Commands

- `/batch view` (or `/batch ui`): Opens full interactive TUI dashboard.
- `/batch goal <prompt>`: Submits an asynchronous goal to the configured batch model.
- `/batch list`: Prints compact terminal table of recorded batch jobs.
- `/batch check`: Polls OpenRouter immediately for state updates.
- `/batch cancel <id>`: Cancels an active in-flight batch.
- `/batch model [slug]`: Views or switches the default batch model (defaults to `anthropic/claude-opus-5.5`).

### LLM Tools

- `batch_submit_goal`: Allows the Pi agent to autonomously offload large sub-tasks to batch mode.
- `batch_check_jobs`: Inspects status and results of recent or active batch jobs.
