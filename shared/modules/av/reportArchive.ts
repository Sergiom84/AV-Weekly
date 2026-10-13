/** A finished PDF, frozen independently of the current editable deck. */
export interface AvArchivedReport {
  id: string;
  year: number;
  week: number;
  filename: string;
  sizeBytes: number;
  savedAt: string;
}

export const AV_ARCHIVE_LIMIT = 5;
