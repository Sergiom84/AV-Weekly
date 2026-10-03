/**
 * Turso HTTP calls go through node-fetch (via the libSQL client). A body of
 * about 2 MB, the Informática snapshot, makes that client reset the socket
 * ("socket hang up"). Node's own fetch carries the same request.
 *
 * The function is called with the Request object the hrana client builds,
 * which is not the same Request class as the global one.
 */
export async function tursoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = readMethod(input, init);
  const headers = new Headers(readHeaders(input, init));
  const body = method === "GET" || method === "HEAD" ? undefined : await readBody(input, init);
  const attempt = () =>
    fetch(readUrl(input), {
      method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
    });

  try {
    return await attempt();
  } catch (error) {
    if (!isTransientDbError(error)) throw error;
    return await attempt();
  }
}

export function isTransientDbError(error: unknown): boolean {
  const text = errorText(error).toLowerCase();

  return (
    text.includes("socket hang up") ||
    text.includes("econnreset") ||
    text.includes("other side closed") ||
    text.includes("und_err_socket") ||
    text.includes("fetch failed")
  );
}

function readUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function readMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method;
  if (typeof input === "string" || input instanceof URL) return "GET";
  return input.method || "GET";
}

function readHeaders(input: RequestInfo | URL, init?: RequestInit): HeadersInit {
  if (init?.headers) return init.headers;
  if (typeof input === "string" || input instanceof URL) return {};
  return input.headers;
}

async function readBody(input: RequestInfo | URL, init?: RequestInit): Promise<ArrayBuffer | undefined> {
  if (init?.body != null) return new Response(init.body).arrayBuffer();
  if (typeof input === "string" || input instanceof URL) return undefined;
  if (typeof input.arrayBuffer === "function") return input.arrayBuffer();
  return undefined;
}

function errorText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;

  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof Error) {
      parts.push(current.message);
      const code = (current as { code?: unknown }).code;
      if (typeof code === "string") parts.push(code);
      current = (current as { cause?: unknown }).cause;
      continue;
    }

    parts.push(String(current));
    break;
  }

  return parts.join(" ");
}
