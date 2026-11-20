// mp3 для группы «Моих слов»: каждое слово озвучивается на сервере (edge-tts), склеивается в браузере
// с паузами и сохраняется только на этом устройстве (IndexedDB). Удалить mp3 можно в любой момент.
import type { AudioStore, GroupAudio } from "@/data/audioStore";
import { joinWithPauses, mp3Seconds } from "@/domain/mp3";

export const MY_AUDIO_VOICES = [
  { id: "jenny", label: "Jenny (США, жен.)" },
  { id: "andrew", label: "Andrew (США, муж.)" },
  { id: "sonia", label: "Sonia (Британия, жен.)" },
] as const;
export const DEFAULT_PAUSE = 1.8;             // как в готовых mp3 со словами (tools/make_word_audio.py)
const PARALLEL = 3;                           // столько слов озвучивается одновременно

export type FetchSpeech = (text: string, voice: string) => Promise<Uint8Array>;
export interface BuildOptions { voice: string; pause: number; onProgress?: (done: number, total: number) => void }

const spoken = (word: string) => word.replace(/\.\.\./g, " ").replace(/\s+/g, " ").trim();
const clipId = (voice: string, word: string) => voice + "|" + spoken(word);

/** mp3 устарел: в группе теперь другие слова (добавили, удалили или исправили). */
export const isOutdated = (audio: GroupAudio, words: readonly string[]) => audio.words.join("\n") !== words.join("\n");

export class MyAudioService {
  constructor(
    private readonly store: AudioStore,
    private readonly fetchSpeech: FetchSpeech,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async recordings(): Promise<GroupAudio[]> { return this.store.groups(); }

  /** Сделать (или переделать) mp3 группы. Уже озвученные слова берутся с устройства, не с сервера. */
  async build(group: string, words: readonly string[], { voice, pause, onProgress }: BuildOptions): Promise<GroupAudio> {
    if (!words.length) throw new Error("В группе нет слов.");
    const clips: Uint8Array[] = new Array(words.length);
    let next = 0, done = 0;
    onProgress?.(0, words.length);
    const worker = async () => {
      while (next < words.length) {
        const index = next++;
        const id = clipId(voice, words[index]);
        let clip = await this.store.clip(id);
        if (!clip) {
          clip = await this.fetchSpeech(spoken(words[index]), voice);
          await this.store.saveClip(id, clip);
        }
        clips[index] = clip;
        onProgress?.(++done, words.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, words.length) }, worker));
    const mp3 = joinWithPauses(clips, pause);
    const audio: GroupAudio = { group, words: [...words], voice, pause, createdAt: this.now(), seconds: mp3Seconds(mp3), mp3 };
    await this.store.saveGroup(audio);
    await this.removeUnusedClips();
    return audio;
  }

  /** Удалить mp3 группы (и озвучку слов, которые больше ни в одном mp3 не нужны). */
  async remove(group: string): Promise<void> {
    await this.store.deleteGroup(group);
    await this.removeUnusedClips();
  }

  private async removeUnusedClips(): Promise<void> {
    const used = new Set((await this.store.groups()).flatMap(a => a.words.map(w => clipId(a.voice, w))));
    await this.store.deleteClips((await this.store.clipIds()).filter(id => !used.has(id)));
  }
}
