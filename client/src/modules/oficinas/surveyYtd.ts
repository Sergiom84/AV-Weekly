export interface SurveyMonthValue {
  month: string;
  value: number | null;
}

/** Monthly YTD values, restarting at the first month of each calendar year. */
export function surveyYtdSeries(values: SurveyMonthValue[]) {
  const runningByYear = new Map<string, number>();

  const series = values.map(entry => {
    const year = entry.month.slice(0, 4);
    const accumulated = (runningByYear.get(year) ?? 0) + (entry.value ?? 0);

    runningByYear.set(year, accumulated);

    return { ...entry, year, accumulated };
  });

  const latestYear = series.at(-1)?.year ?? null;
  const latestSeries =
    latestYear === null ? [] : series.filter(entry => entry.year === latestYear);

  return {
    series,
    latestSeries,
    latestYear,
    latestYtd: latestYear === null ? null : (runningByYear.get(latestYear) ?? 0),
  };
}
