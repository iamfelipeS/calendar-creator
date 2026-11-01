# Codex — Calendar Creator

## Context
React 19 / Vite / Supabase. The frontend manages editable calendars, branding and shield assets. Validate match information against authoritative sources when changing scheduled fixtures; never invent match dates.

## Efficient verification
- Read only modules and contracts affected by the task; do not dump the entire repository to the chat.
- GitHub Actions already runs `pnpm run check` and `pnpm run build` on PRs (`Build Calendar Creator`). Deployment has its own Pages workflow and post-deploy smoke check.
- For changes submitted through a PR, inspect the Actions summary instead of rerunning the entire pipeline manually. On failure, inspect the failed job and relevant logs; confirm completion before saying checks passed.
- No dedicated `test` script exists in `package.json`. Do not claim tests ran, and do not use `pnpm exec vitest` as a substitute without confirming relevant test suites exist.
- Do not trigger Pages deployment, write Supabase records, change secrets or modify hosted configuration without explicit authorization.
- Use one agent by default; only delegate independent complex investigations. Keep documentation and changes proportionate to the task.
