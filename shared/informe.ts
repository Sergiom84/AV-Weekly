/**
 * Compatibility surface of the AV "Informe" deck.
 *
 * The contract now lives in two places: `shared/deck/core.ts` for anything
 * generic to a slide deck, and `shared/modules/av/types.ts` for the AV domain.
 * This file re-exports both under the names client and server already import,
 * so no call site had to change.
 *
 * New code should import from the specific module instead of from here.
 */

export type {
  CellOverrides,
  DatasetSource,
  DeckPage as CoreDeckPage,
  DeckState as CoreDeckState,
  CoreDeckPageKind,
  LabeledMatrix,
  LabeledRow,
  WeekSelection,
  WeeklyMatrix,
  WeeklyRow,
} from "./deck/core.ts";

export {
  ALL_REPORTED_WEEKS_WINDOW,
  MONTH_LABELS,
  TRAILING_WEEK_WINDOW,
  defaultWeekSelection,
  followLatestWeekSelection,
  formatChartMetric,
  isPageVisible,
  metricAxisWidth,
  reportedWeekAvailability,
  resolveWeekSelection,
} from "./deck/core.ts";

export type {
  AvDeckPage,
  AvDeckPage as DeckPage,
  AvDeckPageKind,
  AvDeckPageKind as DeckPageKind,
  AvDeckState,
  AvDeckState as DeckState,
  InformeMonthlyDataset,
  InformePayload,
  InformeWeeklyDataset,
  ResolutionRow,
  SupportType,
  WeeklyComparison,
  WeeklyTypeData,
} from "./modules/av/types.ts";

export {
  AV_SERVICE,
  DEFAULT_VISIBLE_ROWS,
  INFORME_SUPPORT_TYPES,
  RESOLUTION_DETAIL_TYPES,
  RESOLUTION_LABEL,
  SECTION_LABEL,
  TREND_LABEL,
  TYPE_FOOTNOTE,
  comparisonValue,
  createDefaultDeck,
  defaultHiddenRows,
  emptyMonthlyDataset,
  emptyWeeklyDataset,
} from "./modules/av/types.ts";

export { migrateAvDeckWeekSelections } from "./modules/av/weekSelection.ts";

export type {
  ResolutionTableRow,
  ResolutionTableTotals,
} from "./modules/av/speech.ts";

export {
  calculateResolutionTableTotals,
  generateWeeklySpeech,
  resolutionCellKey,
  resolutionValueAt,
} from "./modules/av/speech.ts";
