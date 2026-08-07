import { useCallback } from "react";
import { getDeckModule } from "@shared/deck/registry";
import {
  createDefaultInformaticaDeck,
  emptyInformaticaDataset,
} from "@shared/modules/informatica/deck";
import type {
  InformaticaDataset,
  InformaticaDeckPage,
} from "@shared/modules/informatica/types";
import { useDeckData } from "@/hooks/useDeckData";

/**
 * Informatica deck bound to the flat workbook.
 *
 * `GET /api/informatica` answers `{ deck, data }`, as declared by
 * `InformaticaPayload`. While the server side is not up the hook falls back to
 * the default deck, and every page renders its "Próximamente" notice instead of
 * failing.
 */

const MODULE = getDeckModule("informatica");

const MESSAGES = {
  load: "No se pudo cargar el informe de Informática",
  save: "No se pudo guardar el informe de Informática",
  reset: "No se pudo restablecer el informe de Informática",
};

function readInformaticaData(
  payload: unknown,
  current: InformaticaDataset
): InformaticaDataset {
  const body = (payload ?? {}) as { data?: InformaticaDataset };

  return body.data ?? current;
}

export function useInformaticaDeck() {
  const state = useDeckData<InformaticaDeckPage, InformaticaDataset>({
    apiBase: MODULE.deck?.apiBase ?? "/api/informatica",
    emptyData: emptyInformaticaDataset,
    readData: readInformaticaData,
    fallbackDeck: createDefaultInformaticaDeck,
    messages: MESSAGES,
  });

  const { upload } = state;

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

  return { ...state, dataset: state.data, uploadTo };
}
