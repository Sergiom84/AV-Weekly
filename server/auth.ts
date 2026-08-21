import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

export interface AccessCredentials {
  username: string;
  password: string;
}

export function configuredCredentials(): AccessCredentials | null {
  const username = process.env.APP_ACCESS_USER;
  const password = process.env.APP_ACCESS_PASSWORD;
  const required = process.env.APP_REQUIRE_AUTH === "true";

  if (username && password) {
    return { username, password };
  }

  if (required || username || password) {
    throw new Error(
      "APP_REQUIRE_AUTH=true requires APP_ACCESS_USER and APP_ACCESS_PASSWORD."
    );
  }

  return null;
}

function safeEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);

  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

function readBasicCredentials(
  header: string | undefined
): AccessCredentials | null {
  if (!header?.startsWith("Basic ")) {
    return null;
  }

  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");

    if (separator < 0) {
      return null;
    }

    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

export function createAccessMiddleware(): RequestHandler {
  const expected = configuredCredentials();

  if (!expected) {
    return (_req, _res, next) => next();
  }

  return (req, res, next) => {
    const supplied = readBasicCredentials(req.get("authorization"));

    if (
      supplied &&
      safeEqual(supplied.username, expected.username) &&
      safeEqual(supplied.password, expected.password)
    ) {
      next();
      return;
    }

    res.setHeader(
      "WWW-Authenticate",
      'Basic realm="AV Weekly", charset="UTF-8"'
    );
    res.status(401).send("Acceso requerido");
  };
}
