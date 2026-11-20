// mp3 «Моих слов» — только на этом устройстве (IndexedDB браузера), на сервер не загружаются.
// IndexedDB, а не localStorage: mp3 группы — сотни килобайт, в localStorage (~5 МБ) они не поместятся.
//   clips  — озвучка одного слова: "<голос>|<текст>" → mp3 (чтобы при пересборке группы не озвучивать заново)
//   groups — готовый mp3 группы
export interface GroupAudio {
  group: string;
  words: string[];          // слова в том порядке, в каком звучат
  voice: string;
  pause: number;            // пауза после слова, сек
  createdAt: number;        // мс
  seconds: number;
  mp3: Uint8Array;
}

export interface AudioStore {
  clip(id: string): Promise<Uint8Array | undefined>;
  saveClip(id: string, mp3: Uint8Array): Promise<void>;
  clipIds(): Promise<string[]>;
  deleteClips(ids: string[]): Promise<void>;
  groups(): Promise<GroupAudio[]>;
  saveGroup(audio: GroupAudio): Promise<void>;
  deleteGroup(group: string): Promise<void>;
}

export function createMemoryAudioStore(): AudioStore {
  const clips = new Map<string, Uint8Array>();
  const groups = new Map<string, GroupAudio>();
  return {
    clip: async id => clips.get(id),
    saveClip: async (id, mp3) => { clips.set(id, mp3); },
    clipIds: async () => [...clips.keys()],
    deleteClips: async ids => { for (const id of ids) clips.delete(id); },
    groups: async () => [...groups.values()],
    saveGroup: async audio => { groups.set(audio.group, audio); },
    deleteGroup: async group => { groups.delete(group); },
  };
}

const DB_NAME = "english-my-audio";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** null — IndexedDB недоступна (приватный режим старого Safari, запрет браузера). */
export function createBrowserAudioStore(): AudioStore | null {
  if (typeof indexedDB === "undefined") return null;
  let opened: Promise<IDBDatabase> | null = null;
  const db = () => (opened ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("clips");
      req.result.createObjectStore("groups", { keyPath: "group" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { opened = null; reject(req.error); };
  }));
  const store = async (name: "clips" | "groups", mode: IDBTransactionMode = "readonly") =>
    (await db()).transaction(name, mode).objectStore(name);
  return {
    clip: async id => request((await store("clips")).get(id)),
    saveClip: async (id, mp3) => { await request((await store("clips", "readwrite")).put(mp3, id)); },
    clipIds: async () => (await request((await store("clips")).getAllKeys())).map(String),
    deleteClips: async ids => {
      const clips = await store("clips", "readwrite");
      await Promise.all(ids.map(id => request(clips.delete(id))));
    },
    groups: async () => request((await store("groups")).getAll()),
    saveGroup: async audio => { await request((await store("groups", "readwrite")).put(audio)); },
    deleteGroup: async group => { await request((await store("groups", "readwrite")).delete(group)); },
  };
}
