"""보카800 개발 서버 — 정적 파일 + Unsplash 사진 검색 프록시 (파이썬 표준 라이브러리만 사용)

    python3 server.py            # http://localhost:5173

- UNSPLASH_ACCESS_KEY 는 서버에서만 읽어요. 브라우저는 /api/photos 만 호출하고 키를 볼 수 없어요.
- 키를 찾는 순서: 실제 환경 변수 → .env.local → .env
  (.env 파일은 요청마다 다시 읽으므로 값을 넣은 뒤 서버를 재시작하지 않아도 돼요.)
- .env* 같은 숨김 파일과 서버/도구 코드는 정적 파일로 내보내지 않아요.
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", "5173"))
ENV_FILES = (".env.local", ".env")  # 앞의 파일이 우선
BLOCKED_PREFIXES = ("tools/",)
BLOCKED_FILES = {"server.py"}
UTM = "utm_source=voca800&utm_medium=referral"  # Unsplash 출처 표기 링크 규칙
CACHE_TTL = 60 * 60
_cache = {}


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


def search_unsplash(query, per_page):
    key = get_env("UNSPLASH_ACCESS_KEY")
    if not key:
        return 503, {"error": "UNSPLASH_ACCESS_KEY가 설정되지 않았어요. .env.local에 값을 넣어 주세요."}

    cache_key = (query.lower(), per_page)
    hit = _cache.get(cache_key)
    if hit and time.time() - hit[0] < CACHE_TTL:
        return 200, hit[1]

    url = "https://api.unsplash.com/search/photos?" + urllib.parse.urlencode(
        {"query": query, "per_page": per_page, "content_filter": "high", "orientation": "landscape"}
    )
    req = urllib.request.Request(url, headers={"Authorization": f"Client-ID {key}", "Accept-Version": "v1"})
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            data = json.load(res)
    except urllib.error.HTTPError as e:
        msg = {401: "Unsplash 키가 올바르지 않아요.", 403: "Unsplash 요청 한도를 넘었거나 권한이 없어요."}.get(e.code, "Unsplash 요청에 실패했어요.")
        return e.code, {"error": msg}
    except (urllib.error.URLError, TimeoutError):
        return 502, {"error": "Unsplash에 연결하지 못했어요."}

    # 브라우저에 필요한 필드만 넘겨요 (출처 표기용 작가 정보 포함)
    photos = [
        {
            "id": p["id"],
            "alt": p.get("alt_description") or p.get("description") or query,
            "color": p.get("color"),
            "thumb": p["urls"]["small"],
            "regular": p["urls"]["regular"],
            "link": f'{p["links"]["html"]}?{UTM}',
            "author": p["user"]["name"],
            "authorLink": f'{p["user"]["links"]["html"]}?{UTM}',
        }
        for p in data.get("results", [])
    ]
    body = {"query": query, "photos": photos, "unsplashLink": f"https://unsplash.com/?{UTM}"}
    _cache[cache_key] = (time.time(), body)
    return 200, body


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
            q = urllib.parse.parse_qs(u.query)
            query = (q.get("query") or [""])[0].strip()[:60]
            if not query:
                return self.send_json(400, {"error": "query가 필요해요."})
            try:
                per_page = max(1, min(30, int((q.get("per_page") or ["6"])[0])))
            except ValueError:
                per_page = 6
            return self.send_json(*search_unsplash(query, per_page))
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
