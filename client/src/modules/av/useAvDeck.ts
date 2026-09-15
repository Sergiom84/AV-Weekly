import { useCallback } from "react";
import { emptyMonthlyDataset, emptyWeeklyDataset } from "@shared/informe";
import type {
  AvDeckPage,
  InformeMonthlyDataset,
  InformePayload,
  InformeWeeklyDataset,
} from "@shared/informe";
import { getDeckModule } from "@shared/deck/registry";
import { useDeckData } from "@/hooks/useDeckData";

/**
 * AV deck bound to its two datasets. Thin wrapper over `useDeckData`: the only
 * AV-specific part is which slice of the payload feeds `weekly` and `monthly`.
 */

export interface AvDeckData {
  weekly: InformeWeeklyDataset;
  monthly: InformeMonthlyDataset;
}

const MODULE = getDeckModule("av");

const MESSAGES = {
  load: "No se pudo cargar el informe",
  save: "No se pudo guardar el informe",
  reset: "No se pudo restablecer el informe",
};

function emptyAvData(): AvDeckData {
  return { weekly: emptyWeeklyDataset(), monthly: emptyMonthlyDataset() };
}

/** Keeps the slice the server did not send, as the AV payload is partial. */
function readAvData(payload: unknown, current: AvDeckData): AvDeckData {
  const body = (payload ?? {}) as Partial<InformePayload>;

  return {
    weekly: body.weekly ?? current.weekly,
    monthly: body.monthly ?? current.monthly,
  };
}

export function useAvDeck() {
  const state = useDeckData<AvDeckPage, AvDeckData>({
    apiBase: MODULE.deck?.apiBase ?? "/api/informe",
    emptyData: emptyAvData,
    readData: readAvData,
    messages: MESSAGES,
  });

  const { upload, uploadText } = state;

  const uploadTo = useCallback(
    (slotId: string, file: File) => {
      const slot = MODULE.deck?.uploads.find((entry) => entry.id === slotId);

      if (!slot) {
        return Promise.resolve({ success: false, error: "Origen desconocido" });
      }

      return upload(slot.path, file, slot.error);
    },
    [upload]
  );

  const pasteTo = useCallback(
    (slotId: string, texto: string) => {
      const slot = MODULE.deck?.uploads.find(entry => entry.id === slotId);

      if (!slot) {
        return Promise.resolve({ success: false, error: "Origen desconocido" });
      }

      return uploadText(slot.path, texto, slot.error);
    },
    [uploadText]
  );

  return {
    ...state,
    weekly: state.data.weekly,
    monthly: state.data.monthly,
    uploadTo,
    pasteTo,
  };
}
