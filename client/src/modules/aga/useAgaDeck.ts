import { useCallback } from "react";
import { getDeckModule } from "@shared/deck/registry";
import { createDefaultAgaDeck, emptyAgaDataset } from "@shared/modules/aga/deck";
import type { AgaDataset, AgaDeckPage } from "@shared/modules/aga/types";
import { useDeckData } from "@/hooks/useDeckData";

/**
 * AGA deck bound to the weekly GPS workbook.
 *
 * `GET /api/aga` answers `{ deck, data }`, as declared by `AgaPayload`. When the
 * call fails the hook falls back to the default deck, so the report still
 * renders its pages with the "Próximamente" notice instead of an empty screen.
 */

const MODULE = getDeckModule("aga");

const MESSAGES = {
  load: "No se pudo cargar el informe de AGA",
  save: "No se pudo guardar el informe de AGA",
  reset: "No se pudo restablecer el informe de AGA",
};

function readAgaData(payload: unknown, current: AgaDataset): AgaDataset {
  const body = (payload ?? {}) as { data?: AgaDataset };

  return body.data ?? current;
}

export function useAgaDeck() {
  const state = useDeckData<AgaDeckPage, AgaDataset>({
    apiBase: MODULE.deck?.apiBase ?? "/api/aga",
    emptyData: emptyAgaDataset,
    readData: readAgaData,
    fallbackDeck: createDefaultAgaDeck,
    messages: MESSAGES,
  });

  const { upload } = state;

  const uploadTo = useCallback(
    (slotId: string, input: File | File[]) => {
      const slot = MODULE.deck?.uploads.find((entry) => entry.id === slotId);

      if (!slot) {
        return Promise.resolve({ success: false, error: "Origen desconocido" });
      }

      const files = Array.isArray(input) ? input : [input];

      if (files.length === 0) {
        return Promise.resolve({ success: false, error: slot.error });
      }

      return upload(slot.path, slot.multiple ? files : files[0], slot.error, {
        multiple: slot.multiple,
      });
    },
    [upload]
  );

  return { ...state, dataset: state.data, uploadTo };
}
