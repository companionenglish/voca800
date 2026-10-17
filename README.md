# 보카800

교육부 지정 초등 필수 영어단어 800개를 게임처럼 익히는 학습 사이트예요. 강아지·고양이 캐릭터와 함께 카드 → 퀴즈 → 자동 복습으로 공부해요.

- 하루 20단어 × 40일 코스, 4가지 퀴즈 유형(뜻·단어 고르기, 듣기, 철자 쓰기)과 실시간 난이도 조절
- 틀린 단어는 10분 뒤, 맞힌 단어는 1·3·7·14·30일 뒤 다시 나오는 자동 복습
- 원어민 발음 MP3(edge-tts, `audio/`), 플래시카드 뒷면의 Unsplash 단어 사진
- 학습 기록은 브라우저(localStorage)에만 저장돼요

## 실행

파이썬 3.9+만 있으면 돼요 (외부 패키지 없음).

```bash
cp .env.example .env.local   # UNSPLASH_ACCESS_KEY= 뒤에 Unsplash Access Key 입력
python3 server.py            # http://localhost:5173
```

`server.py`는 정적 파일을 내보내고 `/api/photos`로 Unsplash 검색을 대신해 줘요. 키는 서버에서만 읽고 브라우저로 보내지 않으며, `.env*` 파일은 웹으로 열리지 않아요. 키가 없어도 사진만 빠진 채로 동작해요.

## 배포 (Vercel)

GitHub 저장소를 Vercel에 연결하면 `main`에 푸시할 때마다 자동 배포돼요.

1. Vercel에서 **Add New → Project**로 이 저장소를 가져와요 (Framework Preset: **Other**, 빌드 설정은 비워 둬요).
2. **Environment Variables**에 `UNSPLASH_ACCESS_KEY`를 추가해요.
3. 배포하면 정적 파일은 그대로 나가고, `api/photos.py`가 `/api/photos` 서버리스 함수로 돌아가요.

`server.py`·`tools/`·`.env*`는 `.vercelignore`로 배포에서 빠져요. 검색 결과는 Vercel CDN에 하루 캐시돼서 같은 단어는 Unsplash 요청 한도를 다시 쓰지 않아요.

## 발음 다시 만들기

```bash
pip install edge-tts
python3 tools/make_audio.py en-US-AnaNeural --force   # 목소리 목록: edge-tts --list-voices
```

## 구성

| 경로 | 내용 |
|---|---|
| `index.html`, `css/`, `js/app.js` | 화면과 학습 로직 |
| `js/words.js` | 단어 800개 `[단어, 뜻]` |
| `assets/stickers/` | 캐릭터 스티커 (WebP) |
| `audio/` | 단어별 발음 `001.mp3`–`800.mp3` |
| `api/photos.py` | Unsplash 검색 (Vercel 함수 · 로컬 서버 공용) |
| `server.py` | 로컬 개발 서버 |

사진: [Unsplash](https://unsplash.com/?utm_source=voca800&utm_medium=referral) — 각 사진에 작가를 표기해요.
