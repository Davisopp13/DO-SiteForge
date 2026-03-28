# DO SiteForge — Model Selector Patch

## Overview
Add a model selector to the chat input area that lets the user switch between Claude models (Sonnet, Opus, Haiku) on the fly. The selected model is passed to the Claude Code CLI via the `--model` flag on each spawn. No restart needed — takes effect on the next message.

This works for both providers:
- **Claude Code mode**: passes `--model <alias>` to the spawned `claude` process
- **API key mode**: passes the full model string to the Anthropic Messages API

## Tasks

- [x] **Task 1: Model selector UI in chat input area**
  - Add a small model selector to the left of the textarea in the chat input area
  - Display as a compact pill/button showing the current model abbreviation: "Sonnet", "Opus", or "Haiku"
  - Clicking the pill opens a simple dropdown with three options:
    - **Sonnet** — "Fast, great for most edits" (11px description below name)
    - **Opus** — "Most capable, complex tasks" (11px description)
    - **Haiku** — "Fastest, simple changes" (11px description)
  - Active model gets a checkmark or filled dot indicator
  - Dropdown closes on selection or clicking outside
  - Pill styling: 11px font, --sf-bg-secondary background, 0.5px border, border-radius 99px, 4px 10px padding, cursor pointer. Hover: --sf-border-secondary. The pill should feel like a quiet setting, not a prominent button.
  - Dropdown styling: absolute positioned below the pill, --sf-bg-primary background, 0.5px border, border-radius 8px, 4px padding, subtle shadow (0 2px 8px rgba(0,0,0,0.08)), z-index above the input area
  - Each dropdown option: 12px name (font-weight 500), 10px description (--sf-text-tertiary), 8px vertical padding, hover --sf-bg-secondary, border-radius 6px
  - Default model: "sonnet" (matches current behavior)
  - Store selected model in sidebar state: `currentModel: 'sonnet' | 'opus' | 'haiku'`
  - Dispatch `forge:modelChanged` event when model changes (for future use)
  - Files to modify: `src/editor/sidebar.ts`, `src/editor/styles.css`
  - Test: `npx tsc --noEmit` passes

- [x] **Task 2: Pass model to chat API route**
  - In `src/editor/sidebar.ts`, include the selected model in the POST body to `/api/chat`: `{ message, context, history, model: 'sonnet' | 'opus' | 'haiku' }`
  - In `src/server/routes/chat.ts`, read `req.body.model` and pass it to the provider's `streamChat()` call via `ChatParams`
  - Add `model?: string` to the `ChatParams` interface in `src/server/providers/types.ts`
  - Files to modify: `src/editor/sidebar.ts`, `src/server/routes/chat.ts`, `src/server/providers/types.ts`
  - Test: `npx tsc --noEmit` passes

- [x] **Task 3: Claude Code provider uses model flag**
  - In `src/server/providers/claude-code.ts`, read `params.model` and add `--model ${model}` to the spawn args
  - Model alias mapping: 'sonnet' → 'sonnet', 'opus' → 'opus', 'haiku' → 'haiku' (Claude Code accepts these aliases directly)
  - If no model is specified, omit the `--model` flag entirely (Claude Code uses its own default)
  - Files to modify: `src/server/providers/claude-code.ts`
  - Test: `npx tsc --noEmit` passes

- [x] **Task 4: Anthropic API provider uses model string**
  - In `src/server/providers/anthropic-api.ts`, read `params.model` and map it to the full model string for the API
  - Model mapping: 'sonnet' → 'claude-sonnet-4-20250514', 'opus' → 'claude-opus-4-6', 'haiku' → 'claude-haiku-4-5-20251001'
  - If no model specified, fall back to the model from config (existing behavior)
  - The mapped model string overrides `config.model` for this request only — it doesn't change the stored config
  - Files to modify: `src/server/providers/anthropic-api.ts`
  - Test: `npx tsc --noEmit` passes

- [ ] **Task 5: Model badge on AI responses**
  - When an AI message is rendered, show both the provider badge ("Claude Code" or "API") AND the model used: "Claude Code · Sonnet" or "API · Opus"
  - The model name comes from the request, not the response (since the response doesn't include which model was used for the Claude Code provider)
  - Track which model was used per message in the `ChatMessage` type: add `model?: string` field
  - When rendering, show the model in the existing provider badge: same pill styling, just longer text
  - Files to modify: `src/editor/sidebar.ts`
  - Test: `npx tsc --noEmit` passes

- [ ] **Task 6: Persist model preference**
  - Save the selected model to `~/.siteforge/config.json` when changed (alongside the API key)
  - On sidebar init, read the saved model preference and set it as the default selection
  - Add `model?: string` to the config schema in `src/server/config.ts`
  - Add `GET /api/config/model` endpoint that returns the current model preference
  - Add `POST /api/config/model` endpoint that saves the model preference
  - The sidebar fetches the saved preference on init and applies it to the selector
  - Files to modify: `src/server/config.ts`, `src/server/index.ts` (or `src/server/routes/`), `src/editor/sidebar.ts`
  - Test: `npx tsc --noEmit` passes

## Testing Strategy
- Primary: `npx tsc --noEmit`
- Visual: model selector appears in chat input area, dropdown works, model persists across page refresh
- Integration: select Opus, send a message, verify Claude Code spawns with `--model opus` (check server logs or the AI response quality difference)

## Notes
- The model selector should feel like a power-user feature, not a prominent control. Most of the time you'll leave it on Sonnet. The selector is there for when you need Opus for something complex or Haiku for something quick.
- Claude Code accepts model aliases directly: `--model sonnet`, `--model opus`, `--model haiku`. No need to pass full model strings.
- The dropdown should close when the user starts typing in the textarea (focus on textarea = close dropdown).
- Don't show the model selector when AI is disabled (no provider available). Only show it when `aiStatus.available` is true.
- For the API provider, the model mapping may need updating as Anthropic releases new model versions. Use a constant mapping object that's easy to update.
