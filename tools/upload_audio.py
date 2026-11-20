#!/usr/bin/env python3
"""Загружает mp3 из папки audio/ в Supabase Storage — сайт берёт mp3 оттуда.

    python3 tools/upload_audio.py --dry-run   # только показать, что будет загружено и удалено
    python3 tools/upload_audio.py             # загрузить новые и изменённые mp3, удалить лишние из бакета

Главная копия mp3 — папка audio/ на компьютере. Бакет приводится к ней: новые и изменённые файлы
загружаются, файлы, которых в audio/ больше нет, удаляются из бакета (--keep-extra — не удалять).
Загружаются только .mp3: json с таймингами остаются в git (из них build_site_data.py собирает данные сайта).

Настройки — в tools/.env (файл не попадает в git, образец — tools/.env.example):
    SUPABASE_URL=https://<ref>.supabase.co
    SUPABASE_BUCKET=mp3 audios
    SUPABASE_SECRET_KEY=...      Project Settings → API Keys → secret (или service_role). Никому не показывать!

Изменённый файл узнаётся по размеру и MD5 (eTag в Supabase; если eTag не MD5 — только по размеру). Нужен только Python 3 (без pip).
"""
import argparse
import hashlib
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import paths

ENV_FILE = Path(__file__).resolve().parent / ".env"
CACHE_SECONDS = 604800          # неделя — как было для mp3 на Cloudflare (web/public/_headers)
ATTEMPTS = 3


# ---------------------------------------------------------------- настройки

def read_env(path=None):
    """KEY=value из файла; пустые строки и # комментарии пропускаются, кавычки вокруг значения снимаются."""
    path = path or ENV_FILE
    if not path.exists():
        sys.exit(f"Нет файла {path}. Скопируйте tools/.env.example в tools/.env и впишите значения.")
    env = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip('"').strip("'")
    missing = [k for k in ("SUPABASE_URL", "SUPABASE_BUCKET", "SUPABASE_SECRET_KEY") if not env.get(k)]
    if missing:
        sys.exit(f"В {path} не заданы: {', '.join(missing)}")
    return env


# ---------------------------------------------------------------- что загружать

def local_files(root=None):
    """{ "stories/01_x/jenny.mp3": Path } — все mp3 в audio/."""
    root = root or paths.AUDIO
    return {p.relative_to(root).as_posix(): p for p in sorted(root.rglob("*.mp3")) if not p.name.startswith(".")}


def md5_of(path):
    digest = hashlib.md5()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def plan_sync(local, remote, keep_extra=False):
    """local: {путь: (размер, md5)}, remote: {путь: (размер, eTag)} → (загрузить, удалить), отсортировано."""
    def changed(name, size, md5):
        remote_size, etag = remote[name]
        etag = (etag or "").strip('"').lower()
        is_md5 = len(etag) == 32 and all(c in "0123456789abcdef" for c in etag)
        return remote_size != size or (is_md5 and etag != md5)     # eTag не MD5 — сравниваем только размер
    upload = [p for p, (size, md5) in local.items() if p not in remote or changed(p, size, md5)]
    delete = [] if keep_extra else [p for p in remote if p not in local]
    return sorted(upload), sorted(delete)


# ---------------------------------------------------------------- Supabase Storage API

class Storage:
    def __init__(self, url, bucket, key):
        self.base = url.rstrip("/") + "/storage/v1"
        self.bucket = bucket
        self.key = key

    def _request(self, method, path, body=None, headers=None):
        url = self.base + path
        all_headers = {"apikey": self.key, "Authorization": "Bearer " + self.key, **(headers or {})}
        for attempt in range(1, ATTEMPTS + 1):
            request = urllib.request.Request(url, data=body, method=method, headers=all_headers)
            try:
                with urllib.request.urlopen(request, timeout=120) as response:
                    return json.loads(response.read() or b"null")
            except urllib.error.HTTPError as error:
                text = error.read().decode("utf-8", "replace")[:300]
                if error.code < 500 or attempt == ATTEMPTS:
                    sys.exit(f"Supabase: {method} {path} → HTTP {error.code}: {text}")
            except urllib.error.URLError as error:
                if attempt == ATTEMPTS:
                    sys.exit(f"Нет связи с Supabase: {error.reason}")
            time.sleep(2 * attempt)

    def _object_path(self, name=""):
        return "/" + urllib.parse.quote(self.bucket) + ("/" + urllib.parse.quote(name) if name else "")

    def list_all(self, prefix=""):
        """{путь: (размер, eTag)} — все файлы бакета (папки обходятся рекурсивно)."""
        files, offset = {}, 0
        while True:
            items = self._request("POST", "/object/list" + self._object_path(), json.dumps({
                "prefix": prefix, "limit": 1000, "offset": offset, "sortBy": {"column": "name", "order": "asc"},
            }).encode(), {"Content-Type": "application/json"})
            for item in items:
                full = (prefix + "/" if prefix else "") + item["name"]
                if item.get("id") is None:                       # папка
                    files.update(self.list_all(full))
                elif item["name"] != ".emptyFolderPlaceholder":
                    meta = item.get("metadata") or {}
                    files[full] = (meta.get("size"), meta.get("eTag", ""))
            if len(items) < 1000:
                return files
            offset += 1000

    def upload(self, name, path):
        self._request("POST", "/object" + self._object_path(name), path.read_bytes(), {
            "Content-Type": "audio/mpeg", "x-upsert": "true", "cache-control": f"max-age={CACHE_SECONDS}",
        })

    def delete(self, names):
        for i in range(0, len(names), 100):
            self._request("DELETE", "/object" + self._object_path(), json.dumps({"prefixes": names[i:i + 100]}).encode(),
                          {"Content-Type": "application/json"})

    def public_url(self, name=""):
        return self.base + "/object/public" + self._object_path(name)


# ---------------------------------------------------------------- main

def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="только показать план, ничего не менять")
    parser.add_argument("--keep-extra", action="store_true", help="не удалять из бакета файлы, которых нет в audio/")
    args = parser.parse_args()

    env = read_env()
    storage = Storage(env["SUPABASE_URL"], env["SUPABASE_BUCKET"], env["SUPABASE_SECRET_KEY"])
    files = local_files()
    if not files:
        sys.exit(f"В {paths.AUDIO} нет mp3.")
    local = {name: (path.stat().st_size, md5_of(path)) for name, path in files.items()}
    remote = storage.list_all()
    upload, delete = plan_sync(local, remote, args.keep_extra)

    total_mb = sum(local[n][0] for n in upload) / 1048576
    print(f"В audio/: {len(local)} mp3. В бакете «{storage.bucket}»: {len(remote)} файлов.")
    print(f"Загрузить: {len(upload)} ({total_mb:.1f} МБ). Удалить: {len(delete)}. Без изменений: {len(local) - len(upload)}.")
    if args.dry_run:
        for name in upload:
            print("  + " + name)
        for name in delete:
            print("  - " + name)
        print("--dry-run: ничего не изменено.")
        return

    for i, name in enumerate(upload, 1):
        print(f"  [{i}/{len(upload)}] {name}")
        storage.upload(name, files[name])
    if delete:
        storage.delete(delete)
        print(f"Удалено: {len(delete)}")

    # проверка: теперь бакет совпадает с папкой
    left_upload, left_delete = plan_sync(local, storage.list_all(), args.keep_extra)
    if left_upload or left_delete:
        sys.exit(f"⚠ После загрузки бакет не совпадает с audio/: загрузить {len(left_upload)}, удалить {len(left_delete)}.")
    print("✓ Бакет совпадает с audio/.")
    print("Адрес для сайта (VITE_AUDIO_URL): " + storage.public_url())


if __name__ == "__main__":
    main()
