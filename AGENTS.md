# AV Weekly project contract

## Purpose and stack

AV Weekly is the weekly Audiovisuales service report, rendered as an editable slide deck. It uses React, Vite, TypeScript, Tailwind, Radix UI, Express, libSQL, and server-side workbook parsers.

The code is split in three areas that must stay separated:

- `client/` — React app: deck pages, editor controls, and data hooks.
- `server/` — Express API, libSQL access, and the two workbook parsers.
- `shared/` — canonical contract (`shared/informe.ts`); the source of truth for deck and dataset types.

## Working rules

- `AGENTS.md` is canonical; `CLAUDE.md` is only a short bridge.
- Respond to Sergio in Spanish by default. Keep this file and code comments in English unless product content requires Spanish.
- Before editing, inspect `git status --short`, the deck page or component involved, the server route/parser, `shared/informe.ts`, and the package scripts. Preserve the client/server/shared separation.
- Use the package manager declared by the repository (`pnpm`) for dependency changes. Do not change `.env`, credentials, production data, or external integrations without explicit scope.
- Use July for operational context and access pointers. `.env` is a local fallback for configuration only; never expose or commit secrets. By default the app runs on a local file database (`data/av-weekly.db`).
- User-facing UI must not use emojis or explanatory microcopy. Prefer Lucide/Radix icons with accessible labels.
- Typography is limited to Cormorant Garamond for titles/headings and JetBrains Mono for body, labels, controls, tables, and metrics. Use title, subtitle, and body size tiers; body is the smallest.
- Keep deck pages in `client/src/modules/<module>/pages/`. Reuse `client/src/components/deck/` and Radix primitives before adding new UI patterns.
- Imported datasets are immutable; manual corrections live in the deck state. Do not fabricate business metrics or alter the meaning of imported values.
- Preserve loading, empty, error, and print states. The deck must stay legible when printed.
- Commits are allowed for a finished scoped change. After three consecutive commits, pause and review the full diff before another commit.

## Verification

Run the relevant checks after changes:

```bash
pnpm run check
pnpm run build
```

Review the desktop and mobile layouts, print output, keyboard/focus behavior, data-loading states, and the final diff. Do not run production commands unless the task explicitly requires them.
