// Озвучка через edge-tts (нейроголоса Microsoft Edge) из Cloudflare Worker'а — перенос протокола
// Python-пакета edge-tts 7.3.1 (edge_tts/communicate.py, constants.py). Доступ неофициальный:
// Microsoft может изменить протокол — тогда см. drm.ts (как обновить).
import { CHROMIUM_FULL_VERSION, SEC_MS_GEC_VERSION, TRUSTED_CLIENT_TOKEN, secMsGec } from "./drm";

const WSS_URL = "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const MAJOR = CHROMIUM_FULL_VERSION.split(".")[0];
const TIMEOUT_MS = 20_000;

/** Голоса — те же, что у готовых mp3 (tools/tts.py). */
export const VOICES = {
  jenny: "en-US-JennyNeural",
  sonia: "en-GB-SoniaNeural",
  andrew: "en-US-AndrewNeural",
} as const;
export type VoiceId = keyof typeof VOICES;

export class TtsError extends Error {}

/** WebSocket так, как его даёт Worker (fetch с Upgrade). Подменяется в тестах. */
export interface TtsSocket {
  binaryType?: string;
  accept(): void;
  send(message: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "message", listener: (event: { data: string | ArrayBuffer | Blob }) => void): void;
  addEventListener(type: "close" | "error", listener: (event: unknown) => void): void;
}
export type Connect = (url: string, headers: Record<string, string>) => Promise<TtsSocket>;

/** Настоящее соединение из Worker'а: fetch с заголовком Upgrade: websocket. */
export const workerConnect: Connect = async (url, headers) => {
  const response = await fetch(url, { headers: { ...headers, Upgrade: "websocket" } });
  const socket = (response as Response & { webSocket?: TtsSocket | null }).webSocket;
  if (!socket) throw new TtsError(`Сервис озвучки не принял соединение (HTTP ${response.status}).`);
  return socket;
};

const randomHex = () => crypto.randomUUID().replaceAll("-", "").toUpperCase();
const xmlEscape = (text: string) =>
  text.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[ch]!);
/** Управляющие символы сервис не принимает (как remove_incompatible_characters в edge-tts). */
const clean = (text: string) => text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ");

/** Дата в стиле JavaScript Date.toString() в UTC — так её шлёт Edge. */
export function timestamp(date: Date): string {
  // toUTCString(): "Thu, 20 Nov 2026 09:05:00 GMT" → "Thu Nov 20 2026 09:05:00 GMT+0000 (Coordinated Universal Time)"
  const [weekday, day, month, year, time] = date.toUTCString().replace(",", "").split(" ");
  return `${weekday} ${month} ${day} ${year} ${time} GMT+0000 (Coordinated Universal Time)`;
}

function headersAndData(message: Uint8Array, headerLength: number): { path: string; contentType: string | null; data: Uint8Array } {
  const head = new TextDecoder().decode(message.subarray(0, headerLength));
  const field = (name: string) => head.split("\r\n").find(line => line.startsWith(name + ":"))?.slice(name.length + 1) ?? null;
  return { path: field("Path") ?? "", contentType: field("Content-Type"), data: message.subarray(headerLength + 2) };
}

export interface SynthesizeOptions {
  voice?: VoiceId;
  rate?: string;                 // "-10%" — как у готовых mp3
  connect?: Connect;
  now?: () => Date;
}

/** Озвучить короткий текст (слово, фраза) → mp3 (24 кГц, 48 кбит/с, моно). */
export async function synthesize(text: string, options: SynthesizeOptions = {}): Promise<Uint8Array> {
  const { voice = "jenny", rate = "-10%", connect = workerConnect, now = () => new Date() } = options;
  const url = `${WSS_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&ConnectionId=${randomHex()}` +
    `&Sec-MS-GEC=${secMsGec(now().getTime() / 1000)}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;
  const socket = await connect(url, {
    "Pragma": "no-cache",
    "Cache-Control": "no-cache",
    "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
    "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${MAJOR}.0.0.0 Safari/537.36 Edg/${MAJOR}.0.0.0`,
    "Accept-Language": "en-US,en;q=0.9",
    "Cookie": `muid=${randomHex()};`,
  });

  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(1000, "done"); } catch { /* уже закрыт */ }
      if (error) return reject(error);
      if (!chunks.length) return reject(new TtsError("Сервис озвучки не прислал звук."));
      const mp3 = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
      let offset = 0;
      for (const chunk of chunks) { mp3.set(chunk, offset); offset += chunk.length; }
      resolve(mp3);
    };
    const timer = setTimeout(() => finish(new TtsError("Сервис озвучки не ответил вовремя.")), TIMEOUT_MS);

    const handle = (data: string | ArrayBuffer) => {
      if (typeof data === "string") {
        const end = data.indexOf("\r\n\r\n");
        const { path } = headersAndData(new TextEncoder().encode(data), end === -1 ? data.length : end);
        if (path === "turn.end") finish();
        return;
      }
      const message = new Uint8Array(data);
      if (message.length < 2) return finish(new TtsError("Неожиданный ответ сервиса озвучки (пустое сообщение)."));
      const { path, contentType, data: audio } = headersAndData(message, (message[0] << 8) | message[1]);
      if (path !== "audio") return finish(new TtsError(`Неожиданный ответ сервиса озвучки (${path || "без Path"}).`));
      if (contentType === "audio/mpeg" && audio.length) chunks.push(audio.slice());
    };
    // Сообщения обрабатываются строго по порядку: Blob читается асинхронно, а turn.end может прийти следом
    let queue = Promise.resolve();
    socket.addEventListener("message", event => {
      const { data } = event;
      queue = queue
        .then(async () => handle(typeof data === "string" || data instanceof ArrayBuffer ? data : await data.arrayBuffer()))
        .catch(error => finish(error instanceof Error ? error : new TtsError(String(error))));
    });
    socket.addEventListener("close", () => queue.then(() => finish(chunks.length ? undefined : new TtsError("Сервис озвучки закрыл соединение."))));
    socket.addEventListener("error", () => finish(new TtsError("Ошибка соединения с сервисом озвучки.")));

    socket.binaryType = "arraybuffer";
    socket.accept();
    const date = timestamp(now());
    socket.send(
      `X-Timestamp:${date}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
      '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},' +
      '"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n',
    );
    socket.send(
      `X-RequestId:${randomHex()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${date}Z\r\nPath:ssml\r\n\r\n` +
      "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>" +
      `<voice name='${VOICES[voice]}'><prosody pitch='+0Hz' rate='${rate}' volume='+0%'>` +
      xmlEscape(clean(text)) +
      "</prosody></voice></speak>",
    );
  });
}
