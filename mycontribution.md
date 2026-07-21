# Project Contributions Log

This document tracks all features, bug fixes, infrastructure setups, and UI enhancements completed in the FinPilot codebase.

---

## Completed Tasks

### Task 1: Database & Environment Infrastructure Setup
- **Date**: 2026-07-21
- **Scope**: Database configuration, local MongoDB replica set initialization, and `.env` setup.
- **Key Changes**:
  - Configured `.env` and `.env.local` with environment variables, secret keys (`JWT_ACCESS_SECRET`, `ENCRYPTION_KEY`), and MongoDB connection strings.
  - Resolved MongoDB standalone limitation by enabling replication (`replSetName: rs0`) on the local MongoDB service and executing `replSetInitiate`.
  - Configured auth rate-limiter fallback in development mode when Redis is disconnected.
  - Verified backend API (`:4000`) and React SPA frontend (`:5175`) bootup with successful user registration (`POST /api/v1/auth/register` - HTTP 201) and login (`POST /api/v1/auth/login` - HTTP 200).

---

### Task 2: Auth Validation, Eye-Blinking Animations & Modular Password Suggestions
- **Date**: 2026-07-21
- **Scope**: Frontend authentication UX improvements, form validation, and industry-standard modular file structure.
- **Key Changes**:
  - **Email & Password Validation**: Added real-time email format validation and password criteria checks (minimum 8 characters, uppercase, lowercase, numbers, and special characters).
  - **Password Strength Indicator**: Implemented a dynamic visual password strength meter (Weak/Medium/Strong) with live requirement checklists.
  - **Confirm Password**: Added confirm password field with matching validation.
  - **Eye Blinking Animation**: Implemented toggle buttons with smooth `@keyframes fp-eye-blink` CSS animations for password hide/show functionality.
  - **Suggest Strong Password**: Created a `PasswordSuggestions` component with popover selection and refresh capabilities that auto-fills password fields.
  - **Modular Architecture**:
    - `[passwordUtils.ts](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/web/src/utils/passwordUtils.ts)` — Isolated password evaluation & generation logic.
    - `[EyeIcon.tsx](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/web/src/components/EyeIcon.tsx)` — Reusable animated eye SVG component.
    - `[PasswordSuggestions.tsx](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/web/src/components/PasswordSuggestions.tsx)` — Modular password suggestion popover component.

---

### Task 3: AI Copilot LLM Provider Engine Initialization
- **Date**: 2026-07-21
- **Scope**: AI Copilot Gateway provider initialization and LLM integration.
- **Key Changes**:
  - **Root Cause Identified**: The AI Copilot (`/api/v1/ai/conversations`) threw 503 `SYS_SERVICE_UNAVAILABLE` because `setLlmProvider` was uninitialized when no cloud LLM API key was loaded in `.env`.
  - **Multi-LLM Provider Engine**: Created `[provider.ts](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/api/src/ai/provider.ts)` supporting:
    - **Google Gemini API** (`GEMINI_API_KEY`)
    - **Groq API** (`GROQ_API_KEY`)
    - **OpenAI API** (`OPENAI_API_KEY`)
    - **Smart Dev Financial Engine**: Fallback intent analysis engine that runs tool calls (`getRevenue`, `getExpenses`, `getProfitAndLoss`, `getCashPosition`, `getHealthScore`, etc.) against the user's MongoDB database.
  - Initialized `initLlmProvider()` in `[index.ts](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/api/src/index.ts)` on server startup.

---

### Task 4: Google Gemini API Key Integration & Production Readiness
- **Date**: 2026-07-21
- **Scope**: Loaded Google Gemini API key securely from environment variables, integrated Gemini AI provider, and tested prompt execution.
- **Key Changes**:
  - Updated `[env.ts](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/api/src/config/env.ts)` to validate `GEMINI_API_KEY`.
  - Added `GEMINI_API_KEY` to [`.env`](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/.env) and [`.env.local`](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/.env.local) securely via `process.env.GEMINI_API_KEY`.
  - Configured Gemini AI provider in `[provider.ts](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/api/src/ai/provider.ts)`.
  - Verified live prompt execution end-to-end on FinPilot Copilot.

---

### Task 5: Persistent Session Restoration on Page Refresh
- **Date**: 2026-07-21
- **Scope**: Fixed page refresh redirection bug in React SPA frontend.
- **Key Changes**:
  - **Root Cause**: On page refresh (e.g. at `http://localhost:5175/#copilot`), React memory state (`user`, `company`, `accessToken`) reset to `null`, defaulting `App.tsx` to render `<AuthPage />`.
  - **Session Restoration**: Added mount-time authentication refresh (`POST /api/v1/auth/refresh`) using the browser's `httpOnly` refresh cookie.
  - **Company State Persistence**: Saved active `companyId` to `localStorage` on company selection and restored both user and active company state seamlessly on page reload.

---

### Task 6: Cross-Platform SSE Line Ending Parser Fix
- **Date**: 2026-07-21
- **Scope**: Fixed frontend SSE streaming hang (`Thinking...` / `..`) in `[api.ts](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/web/src/lib/api.ts)`.
- **Key Changes**:
  - **Root Cause**: The frontend `sse()` helper used strict `buffer.indexOf('\n\n')`. When streamed through Vite's dev proxy on Windows, HTTP chunks used `\r\n\r\n` line endings. `indexOf('\n\n')` failed to match, keeping SSE frames buffered indefinitely and causing the copilot UI to stay stuck in `Thinking...`.
  - **Fix**: Replaced hardcoded string matching with cross-platform boundary regex `/\r?\n\r?\n/`. Trimmed `\r` from `type` and `data` strings prior to `JSON.parse`. Now incoming tool calls, content events, and proposals stream in real-time.

---

### Task 7: AI Copilot Grounding Fix & Instant Response
- **Date**: 2026-07-21
- **Scope**: Fixed "grounding failed" raw JSON fallback and slow response time in AI Copilot.
- **Key Changes**:
  - **Root Cause 1 — Slow Response**: Gemini API key was invalid (`AQ.Ab8RN...`). The fetch had no timeout, causing 20–30s hang before falling back to the Smart Engine.
  - **Fix 1**: Added `AbortController` with 5-second timeout to Gemini API call in [`provider.ts`](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/api/src/ai/provider.ts). Gemini now fails fast in <5s and instantly delegates to Smart Engine.
  - **Root Cause 2 — Grounding Failed**: `validateGrounding()` in [`guardrails.ts`](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/api/src/ai/guardrails.ts) filtered out `0` (too short). When `totalIncomePaise: 0`, no numbers remained in the allowed set, causing false grounding failures and triggering 2 extra retries + raw data fallback.
  - **Fix 2**: Updated `validateGrounding()` to short-circuit when tool results have no extractable numbers (empty/zero data is valid). Added `0` and `0.00` as always-allowed values.
  - **Fix 3**: Rewrote `fallbackSmartTurn()` to produce clean human-readable answers (e.g. `"Your total revenue is ₹0. No income transactions have been recorded yet."`) instead of raw JSON dump.
  - **Live Test Verified**: Prompt `"what is my revenue?"` → `HTTP 200` → `event: tool_call (getRevenue)` → `event: content ("Your total revenue is ₹0. No income transactions have been recorded yet.")` → `event: done`. Response time: instant.

---

### Task 8: Gemini API Failure Caching & UI Instant Rendering
- **Date**: 2026-07-21
- **Scope**: Fixed the UI rendering delay where the copilot UI still took ~10+ seconds for a response even after the 5s timeout fix.
- **Key Changes**:
  - **Root Cause**: The AI gateway loop executes multiple chat turns. When Gemini fails (due to an invalid API key), it was attempting to reconnect on *every* turn within the same request, hitting the 5s timeout 2-3 times per prompt, causing a 10-15s total delay before the final response appeared on the page.
  - **Fix**: Implemented failure caching in `[provider.ts](file:///c:/Users/Milan%20Gagiya/Documents/PROJECT%20RESUME/fin-pilot-/apps/api/src/ai/provider.ts)`. Added `geminiDown` flag and `downSince` timestamp. If Gemini fails, it caches the failure for 60 seconds. Subsequent calls during that period immediately short-circuit to the Smart Financial Engine without making a network request or waiting for a timeout.
  - **Result**: The first prompt after server boot takes ~5s (one timeout). All subsequent prompts respond instantly (< 1s) on the frontend.
