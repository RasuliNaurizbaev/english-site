import { describe, expect, it } from "vitest";
import { parseRange } from "./range";
import worker from "./index";

const FILE = Uint8Array.from({ length: 1000 }, (_, i) => i % 256);
/** Подставное хранилище файлов: отдаёт FILE целиком, по кускам, как настоящий поток. */
const env = {
  ASSETS: {
    async fetch(request: Request) {
      if (!new URL(request.url).pathname.endsWith(".mp3")) return new Response("not found", { status: 404 });
      const stream = new ReadableStream<Uint8Array>({
        start(c) { for (let i = 0; i < FILE.length; i += 64) c.enqueue(FILE.slice(i, i + 64)); c.close(); },
      });
      return new Response(stream, { headers: { "Content-Length": String(FILE.length), "Content-Type": "audio/mpeg" } });
    },
  },
};
const get = (path: string, headers: Record<string, string> = {}, method = "GET") =>
  worker.fetch(new Request("https://site.test" + path, { headers, method }), env);
const bytes = async (r: Response) => new Uint8Array(await r.arrayBuffer());

describe("Range: разбор заголовка", () => {
  it("варианты диапазонов", () => {
    expect(parseRange(null, 1000)).toBeNull();
    expect(parseRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=900-", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=990-5000", 1000)).toEqual({ start: 990, end: 999 });
    expect(parseRange("bytes=1000-", 1000)).toBe("invalid");
    expect(parseRange("bytes=0-1,5-9", 1000)).toBeNull();            // несколько диапазонов — отдаём целиком
  });
});

describe("Worker: mp3 с перемоткой", () => {
  it("без Range — весь файл и Accept-Ranges", async () => {
    const r = await get("/audio/a.mp3");
    expect(r.status).toBe(200);
    expect(r.headers.get("Accept-Ranges")).toBe("bytes");
    expect(r.headers.get("Cache-Control")).toBe("public, max-age=604800");
    expect(await bytes(r)).toEqual(FILE);
  });
  it("Range через границы кусков — 206 и ровно нужные байты", async () => {
    const r = await get("/audio/a.mp3", { Range: "bytes=100-299" });
    expect(r.status).toBe(206);
    expect(r.headers.get("Content-Range")).toBe("bytes 100-299/1000");
    expect(r.headers.get("Content-Length")).toBe("200");
    expect(await bytes(r)).toEqual(FILE.slice(100, 300));
  });
  it("Safari сначала просит bytes=0-1", async () => {
    const r = await get("/audio/a.mp3", { Range: "bytes=0-1" });
    expect(r.status).toBe(206);
    expect(await bytes(r)).toEqual(FILE.slice(0, 2));
  });
  it("хвост файла и диапазон за концом", async () => {
    expect(await bytes(await get("/audio/a.mp3", { Range: "bytes=-10" }))).toEqual(FILE.slice(990));
    const bad = await get("/audio/a.mp3", { Range: "bytes=5000-" });
    expect(bad.status).toBe(416);
    expect(bad.headers.get("Content-Range")).toBe("bytes */1000");
  });
  it("HEAD — без тела; нет файла — 404 как есть", async () => {
    const head = await get("/audio/a.mp3", { Range: "bytes=0-9" }, "HEAD");
    expect(head.status).toBe(206);
    expect(head.body).toBeNull();
    expect((await get("/audio/missing.json")).status).toBe(404);
  });
});
