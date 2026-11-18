#!/usr/bin/env python3
"""Локальный сервер для сайта (компьютер + телефон в той же Wi-Fi сети).

    python3 tools/serve.py            # порт 8000
    python3 tools/serve.py 8080

В отличие от `python3 -m http.server` поддерживает HTTP Range — без этого
браузер не может перематывать mp3 (не работают ползунок плеера и караоке).
Раздаёт корень проекта; сайт: http://<адрес>:8000/site/
"""
import http.server
import os
import re
import socket
import socketserver
import sys

import paths

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(paths.ROOT), **kw)

    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_head(self):
        rng = self.headers.get("Range")
        path = self.translate_path(self.path)
        if not rng or os.path.isdir(path) or not os.path.exists(path):
            return super().send_head()
        m = re.match(r"bytes=(\d*)-(\d*)$", rng.strip())
        size = os.path.getsize(path)
        if not m:
            return super().send_head()
        start = int(m.group(1)) if m.group(1) else max(0, size - int(m.group(2) or 0))
        end = int(m.group(2)) if m.group(1) and m.group(2) else size - 1
        end = min(end, size - 1)
        if start > end or start >= size:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return None
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        self._remaining = end - start + 1
        return f

    def copyfile(self, src, dst):
        n = getattr(self, "_remaining", None)
        if n is None:
            return super().copyfile(src, dst)
        self._remaining = None
        while n > 0:
            chunk = src.read(min(64 * 1024, n))
            if not chunk:
                break
            dst.write(chunk)
            n -= len(chunk)

    def log_message(self, fmt, *args):
        pass  # без шума в терминале


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 128   # браузер грузит ~25 файлов сразу; по умолчанию очередь всего 5


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


if __name__ == "__main__":
    with Server(("0.0.0.0", PORT), Handler) as httpd:
        print(f"Компьютер: http://localhost:{PORT}/site/")
        print(f"Телефон:   http://{lan_ip()}:{PORT}/site/   (тот же Wi-Fi)")
        print("Остановить: Ctrl+C")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
