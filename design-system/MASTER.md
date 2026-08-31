# AV Weekly design system

Visual contract for deck slides. Typography and tokens apply to every module.
The slide-legibility rules below were settled on Informática; when extending
another module, match that module's existing screens first. Do not restyle
Oficinas, AGA or AV just to match Informática.

## Typography

- Titles and headings: Cormorant Garamond.
- Body, labels, controls, tables, metrics, and data: JetBrains Mono.
- Semantic hierarchy: title, subtitle, and body. Body is the smallest tier.
- No emojis in UI, states, notifications, or seed content.

## Tokens

Reuse existing Tailwind and CSS variables (`primary`, `foreground`, `muted`,
`border`, `--informe-serie-1` … `--informe-serie-4`). Do not add a second
palette, decorative gradients, or generic AI layouts.

## Cover period

Every module writes the cover date with `weekCoverLabel` in `shared/deck/core.ts`:

`Semana 33 de 2026 · 10-16 agosto`

Recompute it from the uploaded dataset on render. Do not leave a typed period
stale after a new source file. If there is no source, the field stays empty.

## Slide canvas

- Slides are a 16:9 `SlideFrame`. Content must stay inside that frame.
- No scrollbars on a slide (`overflow-auto` on the canvas is a defect).
- Print and present the same layout as the editor. Hidden overflow is only
  allowed after the table or chart has been scaled to fit.

## Tables

Use `MatrixTable` (`client/src/components/deck/MatrixTable.tsx`) before writing
a new table.

- Never `truncate` labels or headers. Wrap at words; hyphenate long Spanish
  compounds (`lang="es"`, `hyphens-auto`). Do not use `overflow-wrap: anywhere`.
- The first column width follows content density (`rowHeaderShare`). A
  two-column product list is not 13 % names.
- `fill={false}` when the framed card must hug the last row (Peticiones,
  Encuestas summary). Default `fill` stretches only when `useFitTableScale`
  needs the parent height (WorkOrders, IMACS, Citas).
- Totals that close a block use Oficinas treatment: `bg-[var(--informe-serie-4)]`
  and white text.
- Month pairs (Sol / Int) take `groupEvery={2}` so a 2 px black rule separates
  groups.
- Numeric cells stay `nowrap`. Empty cells that mean “zero measured” print `0`.

## Charts

Use `CategoryBarChart` unless the page already has a specialised chart.

- Category axes with many months use `allCategories` (every tick, month over
  year). Long names (buildings, departments) use `angledCategories`.
- Value labels on grouped bars use `fitGroupedValueLabels` and
  `centerGroupedValueLabels`. They must not cascade vertically.
- Horizontal bar category ticks stay on one line; size the Y-axis from the
  longest label instead of wrapping mid-word.
- Donuts and gauges share the row with their legend or copy; they must not
  steal the plot. Put the number and the caption in separate blocks when the
  chart below needs height.
- KPI cards use `KpiRow` / `KPI_CARD_HOVER`. Hover lift is part of the card,
  not a one-off.

## Filters

Editor-only. Locked decks stay clean.

- Months: `MonthRangeSelector` (range, last 12, last 18).
- Weeks: `WeekRangeSelector`.
- Series and rows: `RowFilterPanel`, stored in `page.hiddenRows`.
- Years: `YearSelector`.
- Year-on-year monthly charts filter by calendar month index, never by dropping
  `YYYY/MM` rows of the previous year (that zeroes a whole series).

## Density and space

- Give space to the data, not to empty card interiors.
- Separate stacked blocks (Top Ten detail tables) after the Total row.
- Tighten unused gutters (legend pairs, numeric columns) before shrinking type.
- Type may scale down via `--fit-scale` until the floor in `useFitTableScale`;
  it must remain readable. Do not go below that floor and hide overflow.

## Content

- No explanatory microcopy. Hierarchy, names, order, and states explain the UI.
- Do not invent, hide, or reclassify imported figures.
- Loading, empty, error, and print states stay intact.

## Where it lives

| Piece | Path |
|---|---|
| Cover, closing, heading, KPIs | `client/src/components/deck/` |
| Tables | `MatrixTable.tsx` |
| Bar charts | `CategoryBarChart.tsx` |
| Cover date | `shared/deck/core.ts` → `weekCoverLabel` |
| Informática slides | `client/src/modules/informatica/pages/` |
| Oficinas / AGA slides | `client/src/modules/oficinas/pages/`, `…/aga/pages/` |
| AV slides | `client/src/modules/av/pages/` |
