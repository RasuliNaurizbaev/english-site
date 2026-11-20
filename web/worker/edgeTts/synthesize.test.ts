import { afterEach, describe, expect, it, vi } from "vitest";
import { synthesize, timestamp, type TtsSocket } from "./synthesize";
import worker from "../index";

/** Подставной WebSocket сервиса озвучки: отвечает так же, как настоящий (сообщения записаны с edge-tts). */
class FakeSocket implements TtsSocket {
  sent: string[] = [];
  binaryType = "blob";
  private listeners: Record<string, ((event: any) => void)[]> = {};
  constructor(private readonly reply: (socket: FakeSocket) => void) {}
  accept() {}
  send(message: string) { this.sent.push(message); if (this.sent.length === 2) setTimeout(() => this.reply(this)); }
  close() {}
  addEventListener(type: string, listener: (event: any) => void) { (this.listeners[type] ??= []).push(listener); }
  emit(type: string, data?: unknown) { for (const l of this.listeners[type] ?? []) l({ data }); }
}

function audioMessage(bytes: number[], contentType: string | null = "audio/mpeg"): ArrayBuffer {
  const head = new TextEncoder().encode(`X-RequestId:1\r\n${contentType ? `Content-Type:${contentType}\r\n` : ""}Path:audio\r\n`);
  const message = new Uint8Array(2 + head.length + bytes.length);
  message[0] = head.length >> 8; message[1] = head.length & 255;
  message.set(head, 2);
  message.set(bytes, 2 + head.length);
  return message.buffer;
}
const text = (path: string) => `X-RequestId:1\r\nPath:${path}\r\n\r\n{}`;

const replyWithAudio = (socket: FakeSocket) => {
  socket.emit("message", text("turn.start"));
  socket.emit("message", new Blob([audioMessage([1, 2, 3])]));           // Worker отдаёт двоичные сообщения как Blob
  socket.emit("message", audioMessage([4, 5]));
  socket.emit("message", audioMessage([], null));                       // конец звука — без Content-Type
  socket.emit("message", text("turn.end"));
};

afterEach(() => vi.unstubAllGlobals());

describe("edge-tts в Worker'е", () => {
  it("собирает mp3 из двоичных сообщений по порядку (Blob и ArrayBuffer), конец — turn.end", async () => {
    let socket!: FakeSocket;
    let url = "", headers: Record<string, string> = {};
    const mp3 = await synthesize("rock & roll <3", {
      connect: async (u, h) => { url = u; headers = h; return (socket = new FakeSocket(replyWithAudio)); },
      now: () => new Date(Date.UTC(2026, 10, 20, 9, 5, 0)),
    });
    expect([...mp3]).toEqual([1, 2, 3, 4, 5]);
    expect(url).toMatch(/TrustedClientToken=\w+&ConnectionId=[0-9A-F]{32}&Sec-MS-GEC=[0-9A-F]{16}-[0-9A-F]{64}&Sec-MS-GEC-Version=2-/);
    expect(headers.Origin).toBe("chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold");
    expect(socket.binaryType).toBe("arraybuffer");
    expect(socket.sent[0]).toContain("Path:speech.config");
    expect(socket.sent[0]).toContain('"outputFormat":"audio-24khz-48kbitrate-mono-mp3"');
    expect(socket.sent[1]).toContain("X-Timestamp:Fri Nov 20 2026 09:05:00 GMT+0000 (Coordinated Universal Time)Z");
    expect(socket.sent[1]).toContain("<voice name='en-US-JennyNeural'><prosody pitch='+0Hz' rate='-10%' volume='+0%'>rock &amp; roll &lt;3</prosody>");
  });

  it("ошибки: нет звука, обрыв, неизвестное сообщение", async () => {
    const run = (reply: (s: FakeSocket) => void) => synthesize("hi", { connect: async () => new FakeSocket(reply) });
    await expect(run(s => s.emit("message", text("turn.end")))).rejects.toThrow("не прислал звук");
    await expect(run(s => s.emit("close"))).rejects.toThrow("закрыл соединение");
    await expect(run(s => s.emit("message", audioMessage([1]).slice(0, 1)))).rejects.toThrow("пустое сообщение");
  });

  it("дата — как Date.toString() в UTC", () => {
    expect(timestamp(new Date(Date.UTC(2026, 0, 5, 23, 59, 7)))).toBe("Mon Jan 05 2026 23:59:07 GMT+0000 (Coordinated Universal Time)");
  });
});

describe("POST /api/tts", () => {
  const CODE = "rasul-code-1234567";
  const env = { ASSETS: { fetch: async () => new Response("asset") }, ACCESS_CODES: `rasul:${CODE}` };
  const call = (body: unknown, cookie = `el_access=${CODE}`) =>
    worker.fetch(new Request("https://site.test/api/tts", { method: "POST", headers: { Cookie: cookie }, body: JSON.stringify(body) }), env);

  it("только после входа; mp3 от сервиса озвучки; неверные запросы — 400/413", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Object.assign(new Response(null), { webSocket: new FakeSocket(replyWithAudio) })));
    expect((await call({ text: "apple" }, "")).status).toBe(401);
    const ok = await call({ text: "apple", voice: "sonia" });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Content-Type")).toBe("audio/mpeg");
    expect([...new Uint8Array(await ok.arrayBuffer())]).toEqual([1, 2, 3, 4, 5]);
    expect((await call({ text: "кошка" })).status).toBe(400);
    expect((await call({ text: "apple", voice: "robot" })).status).toBe(400);
    expect((await call({ text: "a".repeat(101) })).status).toBe(413);
  });

  it("сервис не принял соединение — 502 с понятной ошибкой", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Forbidden", { status: 403 })));
    const failed = await call({ text: "apple" });
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: "Сервис озвучки не принял соединение (HTTP 403)." });
  });
});
