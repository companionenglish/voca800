"""Unsplash 사진 검색 — GET /api/photos?query=apple&per_page=1

- Vercel: 이 파일이 서버리스 함수로 배포돼요. 키는 Vercel 프로젝트 환경 변수 UNSPLASH_ACCESS_KEY에서 읽어요.
- 로컬: server.py가 photos_response()를 가져다 같은 방식으로 응답해요 (키는 .env.local).
키는 서버에서만 쓰고, 브라우저에는 사진 정보만 넘겨요.
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler

UTM = "utm_source=voca800&utm_medium=referral"  # Unsplash 출처 표기 링크 규칙
CACHE_TTL = 60 * 60
_cache = {}


def search_unsplash(query, per_page, key):
    if not key:
        return 503, {"error": "UNSPLASH_ACCESS_KEY가 설정되지 않았어요."}

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


def photos_response(query_string, key):
    """쿼리스트링을 검사해서 (상태 코드, JSON 본문)을 돌려줘요."""
    q = urllib.parse.parse_qs(query_string)
    query = (q.get("query") or [""])[0].strip()[:60]
    if not query:
        return 400, {"error": "query가 필요해요."}
    try:
        per_page = max(1, min(30, int((q.get("per_page") or ["6"])[0])))
    except ValueError:
        per_page = 6
    return search_unsplash(query, per_page, key)


class handler(BaseHTTPRequestHandler):  # Vercel 파이썬 런타임이 찾는 이름
    def do_GET(self):
        status, body = photos_response(urllib.parse.urlparse(self.path).query, os.environ.get("UNSPLASH_ACCESS_KEY", ""))
        raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        # 성공한 검색은 Vercel CDN에 하루 캐시 → 같은 단어는 Unsplash 요청 한도를 쓰지 않아요
        self.send_header("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800" if status == 200 else "no-store")
        self.end_headers()
        self.wfile.write(raw)
