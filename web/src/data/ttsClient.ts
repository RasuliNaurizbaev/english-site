// Озвучка слова через сервер сайта (Worker → edge-tts, см. worker/edgeTts). Только после входа.

export class TtsRequestError extends Error {}

export async function fetchSpeech(text: string, voice: string): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch("/api/tts", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voice }),
    });
  } catch (error) {
    throw new TtsRequestError("Нет связи с сервером сайта.", { cause: error });
  }
  const type = response.headers.get("Content-Type") ?? "";
  if (response.ok && type.includes("audio/mpeg")) return new Uint8Array(await response.arrayBuffer());
  if (!type.includes("application/json")) throw new TtsRequestError("Сервер сайта недоступен (локальный запуск без Worker'а?).");
  if (response.status === 401) throw new TtsRequestError("Озвучка работает после входа: 👤 «Войти» вверху страницы.");
  const data = await response.json().catch(() => null);
  throw new TtsRequestError(`«${text}»: ` + (data?.error ?? `ошибка сервера ${response.status}`));
}
