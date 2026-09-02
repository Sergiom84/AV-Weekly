import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Router, type RequestHandler } from "express";

export type DepartmentId = "av" | "informatica" | "aga" | "oficinas";

const DEPARTMENTS: DepartmentId[] = ["av", "informatica", "aga", "oficinas"];
const PIN_ENV: Record<DepartmentId, string> = {
  av: "APP_PIN_AV",
  informatica: "APP_PIN_INFORMATICA",
  aga: "APP_PIN_AGA",
  oficinas: "APP_PIN_OFICINAS",
};
const API_DEPARTMENT: Array<[string, DepartmentId]> = [
  ["/api/informe", "av"],
  ["/api/informatica", "informatica"],
  ["/api/aga", "aga"],
  ["/api/oficinas", "oficinas"],
];
const SESSION_MS = 8 * 60 * 60 * 1_000;
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1_000;

interface AttemptState {
  count: number;
  startedAt: number;
}

const attempts = new Map<string, AttemptState>();

function safeEqual(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function pins(): Record<DepartmentId, string> | null {
  const values = Object.fromEntries(
    DEPARTMENTS.map(department => [
      department,
      process.env[PIN_ENV[department]]?.trim() ?? "",
    ])
  ) as Record<DepartmentId, string>;
  const configured = DEPARTMENTS.filter(
    department => values[department] !== ""
  );

  if (configured.length === 0) return null;
  if (configured.length !== DEPARTMENTS.length) {
    throw new Error("Department access requires all four APP_PIN_* variables.");
  }

  for (const department of DEPARTMENTS) {
    if (!/^\d{3}$/.test(values[department])) {
      throw new Error(
        `${PIN_ENV[department]} must contain exactly three digits.`
      );
    }
  }

  if (new Set(Object.values(values)).size !== DEPARTMENTS.length) {
    throw new Error("Each department must use a different APP_PIN_* value.");
  }

  return values;
}

function sessionSecret(): string {
  const value = process.env.APP_PIN_SESSION_SECRET?.trim() ?? "";
  if (value.length < 32) {
    throw new Error(
      "APP_PIN_SESSION_SECRET must contain at least 32 characters."
    );
  }
  return value;
}

function cookieName(department: DepartmentId): string {
  return `avw_access_${department}`;
}

function cookies(header: string | undefined): Record<string, string> {
  return Object.fromEntries(
    (header ?? "")
      .split(";")
      .map(item => item.trim())
      .filter(Boolean)
      .map(item => {
        const separator = item.indexOf("=");
        return separator < 0
          ? [item, ""]
          : [
              item.slice(0, separator),
              decodeURIComponent(item.slice(separator + 1)),
            ];
      })
  );
}

function sign(
  department: DepartmentId,
  expiresAt: number,
  nonce: string
): string {
  return createHmac("sha256", sessionSecret())
    .update(`${department}.${expiresAt}.${nonce}`)
    .digest("base64url");
}

export function createDepartmentToken(
  department: DepartmentId,
  now = Date.now()
): string {
  const expiresAt = now + SESSION_MS;
  const nonce = randomBytes(12).toString("base64url");
  return `${expiresAt}.${nonce}.${sign(department, expiresAt, nonce)}`;
}

export function verifyDepartmentToken(
  department: DepartmentId,
  token: string | undefined,
  now = Date.now()
): boolean {
  if (!token) return false;
  const [rawExpiry, nonce, signature] = token.split(".");
  const expiresAt = Number(rawExpiry);
  if (!Number.isFinite(expiresAt) || expiresAt <= now || !nonce || !signature) {
    return false;
  }
  return safeEqual(signature, sign(department, expiresAt, nonce));
}

function isDepartment(value: string): value is DepartmentId {
  return DEPARTMENTS.includes(value as DepartmentId);
}

function cookieOptions(maxAgeSeconds: number): string {
  return [
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    process.env.NODE_ENV === "production" ? "Secure" : "",
    `Max-Age=${maxAgeSeconds}`,
  ]
    .filter(Boolean)
    .join("; ");
}

export function createDepartmentAccessRouter(): Router {
  const configuredPins = pins();
  if (configuredPins !== null) sessionSecret();
  const router = Router();

  router.get("/api/access/:department/status", (req, res) => {
    if (!isDepartment(req.params.department)) {
      return res.status(404).json({ error: "Departamento desconocido." });
    }
    const department = req.params.department;
    const authorized =
      configuredPins === null ||
      verifyDepartmentToken(
        department,
        cookies(req.get("cookie"))[cookieName(department)]
      );
    res.json({ configured: configuredPins !== null, authorized });
  });

  router.post("/api/access/:department/verify", (req, res) => {
    if (!isDepartment(req.params.department)) {
      return res.status(404).json({ error: "Departamento desconocido." });
    }
    const department = req.params.department;
    if (configuredPins === null) return res.json({ authorized: true });

    const attemptKey = `${req.ip}:${department}`;
    const now = Date.now();
    const current = attempts.get(attemptKey);
    const state =
      !current || now - current.startedAt >= ATTEMPT_WINDOW_MS
        ? { count: 0, startedAt: now }
        : current;

    if (state.count >= MAX_ATTEMPTS) {
      res.setHeader(
        "Retry-After",
        String(Math.ceil(ATTEMPT_WINDOW_MS / 1_000))
      );
      return res
        .status(429)
        .json({ error: "Demasiados intentos. Prueba más tarde." });
    }

    const candidate = String(
      (req.body as { pin?: unknown } | undefined)?.pin ?? ""
    );
    if (!safeEqual(candidate, configuredPins[department])) {
      attempts.set(attemptKey, { ...state, count: state.count + 1 });
      return res.status(401).json({ error: "Clave incorrecta." });
    }

    attempts.delete(attemptKey);
    res.setHeader(
      "Set-Cookie",
      `${cookieName(department)}=${encodeURIComponent(createDepartmentToken(department, now))}; ${cookieOptions(SESSION_MS / 1_000)}`
    );
    res.json({ authorized: true });
  });

  router.post("/api/access/:department/logout", (req, res) => {
    if (!isDepartment(req.params.department)) {
      return res.status(404).json({ error: "Departamento desconocido." });
    }
    res.setHeader(
      "Set-Cookie",
      `${cookieName(req.params.department)}=; ${cookieOptions(0)}`
    );
    res.json({ authorized: false });
  });

  return router;
}

export function createDepartmentApiMiddleware(): RequestHandler {
  const configuredPins = pins();
  if (configuredPins !== null) sessionSecret();

  return (req, res, next) => {
    if (configuredPins === null) return next();

    const match = API_DEPARTMENT.find(
      ([prefix]) => req.path === prefix || req.path.startsWith(`${prefix}/`)
    );
    if (!match) return next();

    const department = match[1];
    const token = cookies(req.get("cookie"))[cookieName(department)];
    if (verifyDepartmentToken(department, token)) return next();

    res.status(401).json({
      error: "Introduce la clave del departamento.",
      code: "DEPARTMENT_PIN_REQUIRED",
      department,
    });
  };
}
