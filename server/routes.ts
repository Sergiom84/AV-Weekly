import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import type {
  DeckState,
  InformeMonthlyDataset,
  InformePayload,
  InformeWeeklyDataset,
} from "../shared/informe.ts";
import {
  createDefaultDeck,
  emptyMonthlyDataset,
  emptyWeeklyDataset,
} from "../shared/informe.ts";
import { client } from "./db.js";
import { parseInformeWeeklyWorkbook } from "./parseInformeWeekly.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

async function readStoredInformeDeck(): Promise<DeckState | null> {
  const result = await client.execute("SELECT data, updated_at FROM informe_deck WHERE id = 1");

  if (result.rows.length === 0) {
    return null;
  }

  try {
    const deck = JSON.parse(result.rows[0].data as string) as DeckState;

    if (!deck || !Array.isArray(deck.pages)) {
      return null;
    }

    return {
      pages: deck.pages,
      updatedAt: deck.updatedAt ?? ((result.rows[0].updated_at as string) ?? null),
    };
  } catch {
    // Ignore malformed deck rows instead of breaking the API.
    return null;
  }
}

async function readStoredInformeWeekly(): Promise<InformeWeeklyDataset | null> {
  const result = await client.execute(
    "SELECT data, source_file, uploaded_at FROM informe_weekly WHERE id = 1"
  );

  if (result.rows.length === 0) {
    return null;
  }

  try {
    const dataset = JSON.parse(result.rows[0].data as string) as InformeWeeklyDataset;

    return {
      ...dataset,
      sourceFile: dataset.sourceFile ?? ((result.rows[0].source_file as string) ?? null),
      uploadedAt: dataset.uploadedAt ?? ((result.rows[0].uploaded_at as string) ?? null),
    };
  } catch {
    return null;
  }
}

async function readStoredInformeMonthly(): Promise<InformeMonthlyDataset | null> {
  const result = await client.execute(
    "SELECT data, source_file, uploaded_at FROM informe_monthly WHERE id = 1"
  );

  if (result.rows.length === 0) {
    return null;
  }

  try {
    const dataset = JSON.parse(result.rows[0].data as string) as InformeMonthlyDataset;

    return {
      ...dataset,
      sourceFile: dataset.sourceFile ?? ((result.rows[0].source_file as string) ?? null),
      uploadedAt: dataset.uploadedAt ?? ((result.rows[0].uploaded_at as string) ?? null),
    };
  } catch {
    return null;
  }
}

async function buildInformePayload(): Promise<InformePayload> {
  const [deck, weekly, monthly] = await Promise.all([
    readStoredInformeDeck(),
    readStoredInformeWeekly(),
    readStoredInformeMonthly(),
  ]);

  return {
    deck: deck ?? createDefaultDeck(),
    weekly: weekly ?? emptyWeeklyDataset(),
    monthly: monthly ?? emptyMonthlyDataset(),
  };
}

router.get("/api/informe", async (_req, res) => {
  try {
    res.json(await buildInformePayload());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al obtener el informe";
    res.status(500).json({ error: message });
  }
});

router.put("/api/informe/deck", async (req, res) => {
  try {
    // Accept both { deck } and a bare deck payload.
    const body = req.body as { deck?: DeckState } & Partial<DeckState>;
    const deck = (body?.deck ?? body) as DeckState | undefined;

    if (!deck || !Array.isArray(deck.pages)) {
      return res.status(400).json({ error: "El deck enviado no es válido: falta la lista de páginas." });
    }

    const updatedAt = new Date().toISOString();
    const storedDeck: DeckState = { pages: deck.pages, updatedAt };

    await client.execute({
      sql: `INSERT INTO informe_deck (id, data, updated_at) VALUES (1, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      args: [JSON.stringify(storedDeck)],
    });

    res.json({ success: true, deck: storedDeck });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al guardar el deck del informe";
    res.status(500).json({ error: message });
  }
});

router.post("/api/informe/upload/semanal", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Debes adjuntar el libro semanal del Informe." });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const dataset = parseInformeWeeklyWorkbook(workbook);
    const stored: InformeWeeklyDataset = {
      ...dataset,
      sourceFile: req.file.originalname,
      uploadedAt: new Date().toISOString(),
    };

    await client.execute({
      sql: `INSERT INTO informe_weekly (id, data, source_file, uploaded_at)
            VALUES (1, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE
            SET data = excluded.data,
                source_file = excluded.source_file,
                uploaded_at = excluded.uploaded_at`,
      args: [JSON.stringify(stored), stored.sourceFile],
    });

    res.json(await buildInformePayload());
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error al procesar el libro semanal del Informe";
    res.status(500).json({ error: message });
  }
});

router.post("/api/informe/reset-deck", async (_req, res) => {
  try {
    await client.execute("DELETE FROM informe_deck WHERE id = 1");

    res.json({ success: true, deck: createDefaultDeck() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al restaurar el deck del informe";
    res.status(500).json({ error: message });
  }
});

export default router;
