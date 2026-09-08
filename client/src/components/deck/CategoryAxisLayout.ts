/** Minimum left margin that keeps each angled label inside its own chart. */
export function categoryStartMargin(
  labels: string[],
  width: number,
  yAxisWidth: number,
  fontSize: number,
  angle: number,
  measureWidth: (label: string) => number = label => label.length * 0.6 * fontSize,
): number {
  if (labels.length === 0 || width <= 0) return 0;
  const radians = angle * Math.PI / 180;
  return Math.ceil(labels.reduce((margin, label, index) => {
    // Each tick is centred in its category band. Later labels have more room
    // to extend left, so a long label near the end must not indent every bar.
    const fraction = (index + 0.5) / labels.length;
    const reach = measureWidth(label) * Math.cos(radians);
    const required = (reach + fontSize * 0.2 - yAxisWidth - fraction * (width - yAxisWidth)) / (1 - fraction);
    return Math.max(margin, required);
  }, 0));
}
