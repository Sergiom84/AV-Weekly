import { useCallback } from "react";
import { getDeckModule } from "@shared/deck/registry";
import {
  createDefaultOficinasDeck,
  emptyOficinasDataset,
} from "@shared/modules/oficinas/deck";
import type {
  OficinasDataset,
  OficinasDeckPage,
} from "@shared/modules/oficinas/types";
import { useDeckData } from "@/hooks/useDeckData";

/**
 * Oficinas deck bound to the weekly "Template oficinas" workbook.
 *
 * `GET /api/oficinas` answers `{ deck, data }`, as declared by
 * `OficinasPayload`. When the call fails the hook falls back to the default
 * deck, so the report still renders its pages with the "Próximamente" notice
 * instead of an empty screen.
 */

const MODULE = getDeckModule("oficinas");

const MESSAGES = {
  load: "No se pudo cargar el informe de Oficinas",
  save: "No se pudo guardar el informe de Oficinas",
  reset: "No se pudo restablecer el informe de Oficinas",
};

function readOficinasData(
  payload: unknown,
  current: OficinasDataset
): OficinasDataset {
  const body = (payload ?? {}) as { data?: OficinasDataset };

  return body.data ?? current;
}

export function useOficinasDeck() {
  const state = useDeckData<OficinasDeckPage, OficinasDataset>({
    apiBase: MODULE.deck?.apiBase ?? "/api/oficinas",
    emptyData: emptyOficinasDataset,
    readData: readOficinasData,
    fallbackDeck: createDefaultOficinasDeck,
    messages: MESSAGES,
  });

  const { upload } = state;

  const uploadTo = useCallback(
    (slotId: string, input: File | File[]) => {
      const slot = MODULE.deck?.uploads.find(entry => entry.id === slotId);

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
