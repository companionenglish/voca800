"""보카800 로컬 개발 서버 — 정적 파일 + Unsplash 사진 검색 (파이썬 표준 라이브러리만 사용)
배포(Vercel)에서는 이 파일 대신 api/photos.py가 서버리스 함수로 돌아가요.

    python3 server.py            # http://localhost:5173

- UNSPLASH_ACCESS_KEY 는 서버에서만 읽어요. 브라우저는 /api/photos 만 호출하고 키를 볼 수 없어요.
- 키를 찾는 순서: 실제 환경 변수 → .env.local → .env
  (.env 파일은 요청마다 다시 읽으므로 값을 넣은 뒤 서버를 재시작하지 않아도 돼요.)
- .env* 같은 숨김 파일과 서버/도구 코드는 정적 파일로 내보내지 않아요.
"""
import json
import os
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from api.photos import photos_response  # Vercel 함수와 같은 코드를 써요

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", "5173"))
ENV_FILES = (".env.local", ".env")  # 앞의 파일이 우선
BLOCKED_PREFIXES = ("tools/", "api/")
BLOCKED_FILES = {"server.py"}


def read_env_file(path):
    values = {}
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip().removeprefix("export ").strip()
                v = v.strip()
                if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
                    v = v[1:-1]
                values[k] = v
    except FileNotFoundError:
        pass
    return values


def get_env(name):
    if os.environ.get(name):
        return os.environ[name]
    for fname in ENV_FILES:
        v = read_env_file(os.path.join(ROOT, fname)).get(name)
        if v:
            return v
    return ""


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_json(self, status, body):
        raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def is_blocked(self, path):
        rel = urllib.parse.unquote(path).lstrip("/")
        parts = [p for p in rel.split("/") if p]
        if any(p.startswith(".") for p in parts):  # .env, .env.local, .claude, .git ...
            return True
        return rel in BLOCKED_FILES or rel.startswith(BLOCKED_PREFIXES)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == "/api/photos":
            return self.send_json(*photos_response(u.query, get_env("UNSPLASH_ACCESS_KEY")))
        if u.path.startswith("/api/"):
            return self.send_json(404, {"error": "없는 API예요."})
        if self.is_blocked(u.path):
            return self.send_error(404)
        return super().do_GET()

    def do_HEAD(self):
        if self.is_blocked(urllib.parse.urlparse(self.path).path):
            return self.send_error(404)
        return super().do_HEAD()


if __name__ == "__main__":
    state = "설정됨" if get_env("UNSPLASH_ACCESS_KEY") else "비어 있음 (.env.local에 값을 넣어 주세요)"
    print(f"보카800 → http://localhost:{PORT}  ·  UNSPLASH_ACCESS_KEY: {state}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
