"""edge-tts로 단어 발음 MP3(audio/001.mp3 ~ 800.mp3)를 만들어요.

    pip install edge-tts
    python3 tools/make_audio.py                      # 기본 목소리
    python3 tools/make_audio.py en-US-AnaNeural      # 다른 목소리 (edge-tts --list-voices)
    python3 tools/make_audio.py en-US-AvaNeural --force   # 이미 있는 파일도 다시 생성
"""
import asyncio, json, os, re, sys

import edge_tts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
args = [a for a in sys.argv[1:] if not a.startswith("--")]
VOICE = args[0] if args else "en-US-AvaNeural"
FORCE = "--force" in sys.argv

src = open(os.path.join(ROOT, "js", "words.js"), encoding="utf-8").read()
words = json.loads(src[src.index("= [") + 2 : src.rindex("]") + 1])
os.makedirs(os.path.join(ROOT, "audio"), exist_ok=True)
sem = asyncio.Semaphore(8)


async def one(n, w):
    out = os.path.join(ROOT, "audio", f"{n:03d}.mp3")
    if not FORCE and os.path.exists(out) and os.path.getsize(out) > 1000:
        return
    text = re.sub(r"\((.*?)\)", r", \1", w)  # a(an) -> "a, an"
    async with sem:
        for attempt in range(4):
            try:
                await edge_tts.Communicate(text, VOICE, rate="-10%").save(out)
                return
            except Exception as e:  # 네트워크 오류 등은 잠시 후 재시도
                err = e
                await asyncio.sleep(1 + attempt)
        print("FAIL", n, w, err)


async def main():
    await asyncio.gather(*(one(i + 1, w) for i, (w, _) in enumerate(words)))
    print(f"done: {VOICE}")


asyncio.run(main())
