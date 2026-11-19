// Отдача части файла (HTTP Range → 206 Partial Content). Только чистые функции, без Cloudflare.
// Зачем: статические файлы Worker'а всегда отдаются целиком (200), а Safari на iPhone
// для <audio> требует частичную отдачу — иначе mp3 может не играть и не перематываться.

export interface ByteRange { start: number; end: number }   // end включительно

/**
 * Разбор заголовка Range для файла размера size.
 * null — заголовка нет или он непонятный (отдаём файл целиком); "invalid" — диапазон за пределами файла (416).
 * Поддерживается один диапазон: bytes=a-b, bytes=a-, bytes=-n (последние n байт) — этого хватает браузерам.
 */
export function parseRange(header: string | null, size: number): ByteRange | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return null;
  let start: number, end: number;
  if (match[1] === "") {                       // bytes=-500 — последние 500 байт
    const suffix = Number(match[2]);
    if (suffix === 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start >= size || start > end) return "invalid";
  return { start, end };
}

/** Поток, который пропускает только байты [start, end] исходного потока. */
export function sliceStream(start: number, end: number): TransformStream<Uint8Array, Uint8Array> {
  let position = 0;                            // сколько байт исходного потока уже прошло
  return new TransformStream({
    transform(chunk, controller) {
      const chunkStart = position;
      position += chunk.byteLength;
      if (position <= start || chunkStart > end) return;
      controller.enqueue(chunk.subarray(Math.max(0, start - chunkStart), Math.min(chunk.byteLength, end - chunkStart + 1)));
    },
  });
}

/** Ответ с частью файла по ответу с целым файлом. */
export async function rangeResponse(full: Response, rangeHeader: string | null): Promise<Response> {
  const headers = new Headers(full.headers);
  headers.set("Accept-Ranges", "bytes");
  if (full.status !== 200 || !full.body) return new Response(full.body, { status: full.status, headers });

  let size = Number(full.headers.get("Content-Length"));
  let body: ReadableStream<Uint8Array> | Uint8Array<ArrayBuffer> = full.body;
  if (!Number.isFinite(size) || size <= 0 || !full.headers.has("Content-Length")) {
    const bytes = new Uint8Array(await full.arrayBuffer());   // размер неизвестен — читаем целиком (mp3 небольшие)
    size = bytes.byteLength;
    body = bytes;
  }

  const range = parseRange(rangeHeader, size);
  if (range === null) return new Response(body as BodyInit, { status: 200, headers });
  if (range === "invalid") {
    headers.set("Content-Range", `bytes */${size}`);
    headers.delete("Content-Length");
    if (body instanceof ReadableStream) await body.cancel();
    return new Response(null, { status: 416, headers });
  }

  headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
  headers.set("Content-Length", String(range.end - range.start + 1));
  const part = body instanceof Uint8Array
    ? body.subarray(range.start, range.end + 1)
    : body.pipeThrough(sliceStream(range.start, range.end));
  return new Response(part as BodyInit, { status: 206, headers });
}
