/* 보카800 — 초등 필수 영단어 학습 (정적 SPA, 데이터는 localStorage에 저장) */
(() => {
  "use strict";

  const WORDS = window.WORDS.map(([w, m], i) => ({ n: i + 1, w, m }));
  const TOTAL = WORDS.length;
  const PER_DAY = 20;
  const DAYS = Math.ceil(TOTAL / PER_DAY);
  const MASTER_BOX = 5;
  const MIN = 60 * 1000, DAY_MS = 24 * 60 * MIN;
  // 상자(box)별 다음 복습까지의 간격 — 틀리면 1번 상자로 돌아가 10분 뒤 다시 나와요
  const INTERVALS = [0, 10 * MIN, 1 * DAY_MS, 3 * DAY_MS, 7 * DAY_MS, 14 * DAY_MS, 30 * DAY_MS];
  const TIERS = [
    { name: "브론즈", xp: 0, medal: "🥉" },
    { name: "실버", xp: 500, medal: "🥈" },
    { name: "골드", xp: 1500, medal: "🥇" },
    { name: "플래티넘", xp: 3500, medal: "💠" },
    { name: "다이아몬드", xp: 7000, medal: "💎" },
    { name: "마스터", xp: 12000, medal: "👑" },
  ];

  /* ---------------- storage ---------------- */
  const KEY = "voca800-v1";
  const blank = () => ({ w: {}, xp: 0, streak: 0, last: null, days: {}, goal: 20, rate: 0.9 });
  let S = blank();
  try { S = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { /* 저장소 사용 불가 */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } };

  const ws = (n) => S.w[n] || { b: 0, due: 0, c: 0, x: 0, k: false };
  const setWs = (n, v) => { S.w[n] = v; };
  const seen = (n) => !!S.w[n] && (S.w[n].c + S.w[n].x > 0 || S.w[n].b > 0);
  const mastered = (n) => { const s = S.w[n]; return !!s && (s.b >= MASTER_BOX || s.k); };
  const status = (n) => (mastered(n) ? "mastered" : seen(n) ? "learning" : "new");
  const dueList = () => WORDS.filter((x) => { const s = S.w[x.n]; return s && s.b > 0 && !s.k && s.due <= Date.now(); });

  const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = () => S.days[todayKey()] || { solved: 0, correct: 0, learned: 0 };

  function touchStreak() {
    const t = todayKey();
    if (S.last === t) return;
    const y = new Date(); y.setDate(y.getDate() - 1);
    S.streak = S.last === todayKey(y) ? S.streak + 1 : 1;
    S.last = t;
  }
  function streakAlive() {
    if (!S.last) return 0;
    const y = new Date(); y.setDate(y.getDate() - 1);
    return S.last === todayKey() || S.last === todayKey(y) ? S.streak : 0;
  }

  function grade(n, ok) {
    const s = { ...ws(n) };
    if (ok) { s.c++; s.b = Math.min(INTERVALS.length - 1, Math.max(1, s.b + 1)); }
    else { s.x++; s.b = 1; }
    s.due = Date.now() + INTERVALS[s.b];
    setWs(n, s);
    const d = today();
    d.solved++; if (ok) d.correct++;
    S.days[todayKey()] = d;
    touchStreak();
  }
  function addXp(v) { S.xp += v; }

  const tierOf = (xp) => { let t = TIERS[0]; for (const x of TIERS) if (xp >= x.xp) t = x; return t; };
  const levelOf = (xp) => Math.floor(Math.sqrt(xp / 40)) + 1;

  /* ---------------- helpers ---------------- */
  const $ = (s, el = document) => el.querySelector(s);
  const app = $("#app");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const dayWords = (d) => WORDS.slice((d - 1) * PER_DAY, d * PER_DAY);
  const dayProgress = (d) => { const l = dayWords(d); return l.filter((x) => seen(x.n)).length / l.length; };
  const currentDay = () => { for (let d = 1; d <= DAYS; d++) if (dayProgress(d) < 1) return d; return DAYS; };
  const speakText = (w) => w.replace(/\(.*?\)/g, "").trim();
  const answers = (w) => { const base = w.toLowerCase(); const out = [base.replace(/\(.*?\)/g, "").trim()]; const p = base.match(/\((.*?)\)/); if (p) out.push(...p[1].split("/").map((s) => s.trim())); return out; };

  let toastTimer;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 1800); }
  function xpPop(v, el) {
    const r = el ? el.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0 };
    const p = document.createElement("div"); p.className = "xp-pop"; p.textContent = `+${v} XP`;
    p.style.left = `${r.left + r.width / 2 - 30}px`; p.style.top = `${r.top - 10}px`;
    document.body.appendChild(p); setTimeout(() => p.remove(), 900);
  }

  /* ---------------- speech ---------------- */
  // 단어 발음은 edge-tts(en-US-AvaNeural)로 미리 만든 audio/NNN.mp3를 재생하고,
  // 파일을 불러오지 못하면 브라우저 내장 음성(speechSynthesis)으로 대신 읽어요.
  const AUDIO_NO = new Map(WORDS.map((x) => [x.w, x.n]));
  const player = new Audio();
  player.preload = "auto";
  let voice = null;
  function pickVoice() {
    if (!("speechSynthesis" in window)) return;
    const vs = speechSynthesis.getVoices().filter((v) => /^en[-_]/i.test(v.lang));
    voice = vs.find((v) => /en[-_]US/i.test(v.lang) && /Samantha|Google|Natural|Aria|Jenny/i.test(v.name)) || vs.find((v) => /en[-_]US/i.test(v.lang)) || vs[0] || null;
  }
  if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function stopSpeech() {
    player.pause();
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  }
  function speakFallback(text) {
    if (!("speechSynthesis" in window)) { toast("이 브라우저는 발음 듣기를 지원하지 않아요"); return; }
    const u = new SpeechSynthesisUtterance(speakText(text));
    u.lang = "en-US"; u.rate = S.rate; if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  }
  function speak(text) {
    stopSpeech();
    const n = AUDIO_NO.get(text);
    if (!n) return speakFallback(text);
    player.src = `audio/${String(n).padStart(3, "0")}.mp3`;
    player.playbackRate = S.rate / 0.9; // 설정의 '보통'(0.9)을 원래 속도로
    player.play().catch((e) => { if (e.name !== "AbortError" && e.name !== "NotAllowedError") speakFallback(text); });
  }

  /* ---------------- stickers (강아지·고양이 친구들) ---------------- */
  const sticker = (name, cls = "", alt = "") => `<img class="sticker ${cls}" src="assets/stickers/${name}.webp" alt="${alt}" draggable="false" decoding="async">`;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const CHEER = ["clap", "high-five", "laugh", "cheer", "dance", "jump", "proud"];
  const COMFORT = ["comfort", "hug", "make-up", "nervous"];
  const Q_STICKER = { meaning: "curious", word: "think", listen: "whisper", spell: "write" };
  // 피드백 스티커가 깜빡이지 않도록 미리 불러와요
  [...CHEER, ...COMFORT, ...Object.values(Q_STICKER)].forEach((n) => { new Image().src = `assets/stickers/${n}.webp`; });
  /* ---------------- photos (Unsplash — server.py의 /api/photos가 키를 들고 대신 검색해요) ---------------- */
  const photoCache = new Map();
  function wordPhoto(x) {
    const q = speakText(x.w).toLowerCase();
    if (!photoCache.has(q)) {
      photoCache.set(q, fetch(`api/photos?query=${encodeURIComponent(q)}&per_page=1`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => (d && d.photos && d.photos[0] ? { ...d.photos[0], unsplashLink: d.unsplashLink } : null))
        .catch(() => null));
    }
    return photoCache.get(q);
  }
  const preloadPhoto = (x) => wordPhoto(x).then((p) => { if (p) new Image().src = p.regular; });
  const pageHead = (title, sub, st) => `<div class="page-head fade-in"><div><h1 class="page-title">${title}</h1><p class="page-sub">${sub}</p></div>${sticker(st, "head-st")}</div>`;

  /* ---------------- views ---------------- */
  function ring(val, max, label) {
    const r = 32, c = 2 * Math.PI * r, p = Math.min(1, max ? val / max : 0);
    return `<svg class="ring" viewBox="0 0 76 76"><circle class="track" cx="38" cy="38" r="${r}"/>
      <circle class="bar" cx="38" cy="38" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}"/>
      <text x="38" y="45" text-anchor="middle">${label}</text></svg>`;
  }

  function viewHome() {
    const d = currentDay(), due = dueList().length, t = today();
    const mCount = WORDS.filter((x) => mastered(x.n)).length;
    const lCount = WORDS.filter((x) => status(x.n) === "learning").length;
    const tot = Object.values(S.w).reduce((a, s) => a + s.c + s.x, 0);
    const cor = Object.values(S.w).reduce((a, s) => a + s.c, 0);
    const wrongN = WORDS.filter((x) => ws(x.n).x > 0 && !mastered(x.n)).length;
    const firstTime = !S.last;
    app.innerHTML = `
      <section class="hero fade-in">
        <div class="hero-copy">
          <span class="eyebrow">초등 필수 영단어 800</span>
          <h1>${firstTime ? "멍멍이랑 야옹이랑<br/>영어 단어 놀이해요!" : `오늘도 반가워요!<br/>Day ${d} 같이 할까요?`}</h1>
          <p>교육부 지정 초등 필수 영단어 800개를 게임처럼 풀고, 자동 복습으로 오래오래 기억해요.</p>
          <div class="hero-actions">
            <a class="btn" href="#/learn/${d}">${firstTime ? "지금 시작하기" : `Day ${d} 학습하기`} →</a>
            ${due ? `<a class="btn btn-white" href="#/review">복습 ${due}개 하기</a>` : ""}
          </div>
        </div>
        <div class="hero-art">
          <span class="bubble">${firstTime ? "Hello! 👋" : due ? `복습할 단어가<br/>${due}개 있어요!` : "Let's study!"}</span>
          ${sticker(firstTime ? "hello" : "study", "hero-st", "강아지와 고양이 친구")}
        </div>
      </section>

      <div class="stat-grid">
        <div class="stat card goal-card" style="grid-column: span 2">
          <div class="goal-row">
            ${ring(t.solved, S.goal, `${Math.min(100, Math.round((t.solved / S.goal) * 100))}%`)}
            <div>
              <div class="label">오늘의 목표</div>
              <div class="value">${t.solved}<small>/ ${S.goal}문제</small></div>
              <div class="muted" style="font-size:13px">${t.solved >= S.goal ? "목표 달성! 대단해요 🎉" : `${S.goal - t.solved}문제만 더 풀면 목표 달성!`}</div>
            </div>
            ${sticker(t.solved >= S.goal ? "cheer" : t.solved ? "run" : "walk", "goal-st")}
          </div>
        </div>
        <div class="stat bg-peach"><div class="label">🔥 연속 학습</div><div class="value">${streakAlive()}<small>일</small></div></div>
        <div class="stat bg-sky"><div class="label">🎯 정확도</div><div class="value">${tot ? Math.round((cor / tot) * 100) : 0}<small>%</small></div></div>
      </div>

      <div class="card" style="margin-top:14px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap">
          <h3>나의 어휘력</h3><span class="muted" style="font-size:14px">외운 단어 ${mCount} · 학습 중 ${lCount} · 남은 단어 ${TOTAL - mCount - lCount}</span>
        </div>
        <div class="progress" style="height:14px;margin:14px 0 8px;display:flex">
          <i style="width:${(mCount / TOTAL) * 100}%;background:var(--good);border-radius:0"></i>
          <i style="width:${(lCount / TOTAL) * 100}%;border-radius:0"></i>
        </div>
        <div class="muted" style="font-size:14px">800개 중 <b style="color:var(--ink)">${mCount}개</b>를 완전히 내 것으로 만들었어요.</div>
      </div>

      <h2 class="section-title">학습하기</h2>
      <div class="feature-grid">
        <a class="feature bg-sky" href="#/learn/${d}">${sticker("show-book", "feature-st")}<h3>새 단어 학습</h3><p>하루 20단어씩, 카드로 익히고 퀴즈로 확인해요. 실력에 맞게 문제 난이도가 바뀌어요.</p></a>
        <a class="feature bg-butter" href="#/review">${sticker("repeat", "feature-st")}<h3>자동 복습 ${due ? `<span class="status-dot st-learning">${due}</span>` : ""}</h3><p>잊을 만할 때 딱! 틀린 단어는 10분 뒤, 맞힌 단어는 1·3·7·14·30일 뒤에 다시 나와요.</p></a>
        <a class="feature bg-pink" href="#/wrong">${sticker("write", "feature-st")}<h3>오답 노트 ${wrongN ? `<span class="status-dot st-learning">${wrongN}</span>` : ""}</h3><p>틀렸던 단어만 모아서 다시 풀어요. 지금 틀렸다고 걱정하지 마세요!</p></a>
      </div>`;
  }

  function viewLearn() {
    const cur = currentDay();
    let html = "";
    for (let d = 1; d <= DAYS; d++) {
      const l = dayWords(d), p = dayProgress(d), m = l.filter((x) => mastered(x.n)).length;
      const done = p >= 1;
      html += `<a class="day ${done ? "done" : ""} ${d === cur ? "current" : ""}" href="#/learn/${d}">
        <span class="badge">${done ? (m === l.length ? "완벽 ✨" : "완료") : d === cur ? "학습 중" : `${l[0].w[0].toUpperCase()}–${l[l.length - 1].w[0].toUpperCase()}`}</span>
        <span class="d-title">Day ${d}</span>
        <span class="d-range">${String(l[0].n).padStart(3, "0")}–${String(l[l.length - 1].n).padStart(3, "0")}</span>
        <span class="d-words">${l.slice(0, 4).map((x) => esc(x.w)).join(", ")}…</span>
        <span class="progress"><i style="width:${p * 100}%"></i></span>
      </a>`;
    }
    app.innerHTML = `${pageHead("새 단어 학습", `800단어를 하루 20개씩 ${DAYS}일 코스로 나눴어요.<br/>아무 Day나 골라서 시작할 수 있어요.`, "walk")}
      <div class="day-grid fade-in">${html}</div>`;
  }

  /* ---------------- word list ---------------- */
  const listState = { q: "", f: "all", letter: "", limit: 120 };
  function viewWords() {
    const letters = [...new Set(WORDS.map((x) => x.w[0].toLowerCase()))];
    const filters = [["all", "전체"], ["new", "새 단어"], ["learning", "학습 중"], ["mastered", "외운 단어"], ["wrong", "오답"]];
    app.innerHTML = `${pageHead("단어장", "외운 단어는 ✔ 표시하세요.<br/>🔊를 누르면 발음을 들을 수 있어요.", "share-book")}
      <div class="toolbar">
        <input class="search" id="q" type="search" placeholder="영어 단어나 뜻으로 검색" value="${esc(listState.q)}" autocomplete="off" />
        <div class="seg" id="filters">${filters.map(([k, v]) => `<button data-f="${k}" class="${listState.f === k ? "on" : ""}">${v}</button>`).join("")}</div>
      </div>
      <div class="alpha" id="alpha"><button data-l="" class="${!listState.letter ? "on" : ""}" style="width:auto;padding:0 12px">ALL</button>${"abcdefghijklmnopqrstuvwxyz".split("").map((l) => `<button data-l="${l}" class="${listState.letter === l ? "on" : ""}" ${letters.includes(l) ? "" : "disabled"}>${l.toUpperCase()}</button>`).join("")}</div>
      <div id="count" class="muted" style="font-size:14px;margin-bottom:10px"></div>
      <div class="word-table" id="table"></div>
      <div style="text-align:center"><button class="btn btn-ghost more" id="more" hidden>더 보기</button></div>`;
    renderList();
    $("#q").addEventListener("input", (e) => { listState.q = e.target.value; listState.limit = 120; renderList(); });
    $("#filters").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; listState.f = b.dataset.f; listState.limit = 120; $("#filters").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); renderList(); });
    $("#alpha").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b || b.disabled) return; listState.letter = b.dataset.l; listState.limit = 120; $("#alpha").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); renderList(); });
    $("#more").addEventListener("click", () => { listState.limit += 200; renderList(); });
    $("#table").addEventListener("click", (e) => {
      const sp = e.target.closest("[data-speak]"); if (sp) { speak(WORDS[sp.dataset.speak - 1].w); return; }
      const ck = e.target.closest("[data-check]");
      if (ck) {
        const n = +ck.dataset.check, s = { ...ws(n) }; s.k = !s.k; setWs(n, s); save();
        ck.classList.toggle("on", s.k); ck.setAttribute("aria-checked", s.k);
        const dot = ck.parentElement.querySelector(".status-dot"); if (dot) dot.outerHTML = statusDot(n);
        updateTop();
      }
    });
  }
  const statusDot = (n) => { const s = status(n); return `<span class="status-dot st-${s}">${{ new: "새 단어", learning: "학습 중", mastered: "외움" }[s]}</span>`; };
  function renderList() {
    const q = listState.q.trim().toLowerCase();
    let l = WORDS.filter((x) => (!listState.letter || x.w[0].toLowerCase() === listState.letter) && (!q || x.w.toLowerCase().includes(q) || x.m.includes(q)));
    if (listState.f === "wrong") l = l.filter((x) => ws(x.n).x > 0);
    else if (listState.f !== "all") l = l.filter((x) => status(x.n) === listState.f);
    $("#count").textContent = `${l.length}개 단어`;
    let html = "", prev = "";
    for (const x of l.slice(0, listState.limit)) {
      const L = x.w[0].toUpperCase();
      if (L !== prev && !q) { html += `<div class="letter-head">${L}</div>`; prev = L; }
      const k = ws(x.n).k;
      html += `<div class="word-row"><span class="n">${String(x.n).padStart(3, "0")}</span><span class="w">${esc(x.w)}</span><span class="m">${esc(x.m)}</span>${statusDot(x.n)}
        <span style="display:flex;gap:8px;align-items:center"><button class="icon-btn" data-speak="${x.n}" aria-label="${esc(x.w)} 발음 듣기">🔊</button><button class="check ${k ? "on" : ""}" data-check="${x.n}" role="checkbox" aria-checked="${k}" aria-label="외운 단어 표시">✓</button></span></div>`;
    }
    $("#table").innerHTML = html || `<div class="empty">${sticker("curious", "empty-st")}<p>찾는 단어가 없어요.</p></div>`;
    $("#more").hidden = l.length <= listState.limit;
  }

  /* ---------------- stats ---------------- */
  function viewStats() {
    const days = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const k = todayKey(d); days.push({ k, label: i === 0 ? "오늘" : "일월화수목금토"[d.getDay()], v: (S.days[k] || {}).solved || 0 }); }
    const max = Math.max(10, ...days.map((d) => d.v));
    const tier = tierOf(S.xp), next = TIERS[TIERS.indexOf(tier) + 1];
    const boxes = [0, 0, 0, 0, 0, 0, 0];
    WORDS.forEach((x) => { const s = S.w[x.n]; if (s && seen(x.n)) boxes[s.b]++; });
    const newCount = WORDS.filter((x) => !seen(x.n)).length;
    const labels = ["새 단어", "10분 뒤", "1일 뒤", "3일 뒤", "7일 뒤", "14일 뒤", "30일 뒤"];
    const totalDays = Object.keys(S.days).length;
    app.innerHTML = `${pageHead("학습 기록", "꾸준함이 실력이 돼요.<br/>성장을 눈으로 확인해 보세요.", "dance")}
      <div class="card league fade-in">
        <span class="medal">${tier.medal}</span>
        <div style="flex:1">
          <div class="muted" style="font-size:13px;font-weight:600">나의 리그 · Lv.${levelOf(S.xp)}</div>
          <h2 style="font-size:24px">${tier.name} 리그</h2>
          <div class="muted" style="font-size:14px;margin-top:4px">${next ? `${next.name}까지 ${next.xp - S.xp} XP 남았어요` : "최고 리그에 도달했어요!"}</div>
          ${next ? `<div class="progress" style="margin-top:10px"><i style="width:${((S.xp - tier.xp) / (next.xp - tier.xp)) * 100}%"></i></div>` : ""}
          <div class="tiers">${TIERS.map((t) => `<span class="${t === tier ? "on" : ""}">${t.medal} ${t.name}</span>`).join("")}</div>
        </div>
        ${sticker(S.xp ? "proud" : "stretch", "league-st")}
      </div>

      <div class="stat-grid">
        <div class="stat bg-sky"><div class="label">⚡ 총 경험치</div><div class="value">${S.xp}<small>XP</small></div></div>
        <div class="stat bg-peach"><div class="label">🔥 연속 학습</div><div class="value">${streakAlive()}<small>일</small></div></div>
        <div class="stat bg-mint"><div class="label">✅ 외운 단어</div><div class="value">${WORDS.filter((x) => mastered(x.n)).length}<small>개</small></div></div>
        <div class="stat bg-butter"><div class="label">📅 학습한 날</div><div class="value">${totalDays}<small>일</small></div></div>
      </div>

      <h2 class="section-title">최근 7일 푼 문제</h2>
      <div class="card"><div class="chart">${days.map((d) => `<div class="col"><span class="v">${d.v || ""}</span><div class="bar ${d.v ? "" : "zero"}" style="height:${(d.v / max) * 100}%"></div><span class="d">${d.label}</span></div>`).join("")}</div></div>

      <h2 class="section-title">복습 단계별 단어</h2>
      <div class="card box-bars">
        ${[newCount, ...boxes.slice(1)].map((v, i) => `<div class="row"><span>${labels[i]}</span><span class="progress"><i style="width:${(v / TOTAL) * 100}%;${i >= MASTER_BOX ? "background:var(--good)" : i === 0 ? "background:var(--ink-3)" : ""}"></i></span><span class="num">${v}</span></div>`).join("")}
      </div>

      <h2 class="section-title">설정</h2>
      <div class="card">
        <div class="settings-row"><span>하루 목표</span><select id="goal">${[10, 20, 30, 50, 100].map((g) => `<option value="${g}" ${S.goal === g ? "selected" : ""}>${g}문제</option>`).join("")}</select></div>
        <div class="settings-row"><span>발음 속도</span><select id="rate">${[[0.7, "느리게"], [0.9, "보통"], [1.1, "빠르게"]].map(([v, l]) => `<option value="${v}" ${S.rate === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <div class="settings-row"><span>학습 기록 초기화</span><button class="btn btn-sm btn-ghost" id="reset" style="color:var(--bad)">초기화</button></div>
      </div>`;
    $("#goal").onchange = (e) => { S.goal = +e.target.value; save(); toast("하루 목표를 바꿨어요"); };
    $("#rate").onchange = (e) => { S.rate = +e.target.value; save(); speak("hello"); };
    $("#reset").onclick = () => { if (confirm("모든 학습 기록이 지워져요. 정말 초기화할까요?")) { S = blank(); save(); updateTop(); toast("초기화했어요"); viewStats(); } };
  }

  /* ---------------- study session ---------------- */
  let session = null;
  const QTYPES = ["meaning", "word", "listen", "spell"];
  const QLABEL = { meaning: "알맞은 뜻을 고르세요", word: "알맞은 단어를 고르세요", listen: "듣고 알맞은 뜻을 고르세요", spell: "단어를 직접 써 보세요" };

  function startSession({ list, title, cards }) {
    if (!list.length) return;
    session = { title, list, cards: !!cards, stage: cards ? "cards" : "quiz", ci: 0, queue: shuffle(list), qi: 0, graded: new Set(), retried: new Set(),
      correct: 0, wrong: [], xp: 0, combo: 0, best: 0, diff: 0, answered: false, back: location.hash };
    renderSession();
  }

  function pickType(x) {
    const b = ws(x.n).b;
    const base = b <= 0 ? 0 : b === 1 ? 1 : b === 2 ? 2 : 3; // 상자가 높을수록 어려운 문제
    const r = Math.random(), jitter = r < 0.25 ? -1 : r > 0.7 ? 1 : 0; // 문제 유형이 단조롭지 않도록 살짝 섞어요
    let lvl = Math.max(0, Math.min(3, base + session.diff + jitter));
    return QTYPES[lvl];
  }
  function distractors(x, key) {
    const used = new Set([x[key]]), out = [];
    for (const y of shuffle(WORDS)) { if (out.length >= 3) break; if (y.n === x.n || used.has(y[key])) continue; used.add(y[key]); out.push(y); }
    return shuffle([x, ...out]);
  }

  function renderSession() {
    const s = session;
    if (s.stage === "cards") return renderCard();
    if (s.qi >= s.queue.length) return renderResult();
    const x = s.queue[s.qi];
    const type = pickType(x);
    s.cur = { x, type, opts: type === "spell" ? null : distractors(x, type === "word" ? "w" : "m") };
    s.answered = false;
    const pct = (s.qi / s.queue.length) * 100;
    let prompt;
    if (type === "meaning") prompt = `<div class="q-prompt">${esc(x.w)} <button class="icon-btn" data-act="speak" aria-label="발음 듣기">🔊</button></div>`;
    else if (type === "word") prompt = `<div class="q-prompt ko">${esc(x.m)}</div>`;
    else if (type === "listen") prompt = `<div class="q-prompt"><button class="icon-btn q-listen" data-act="speak" aria-label="다시 듣기">🔊</button></div>`;
    else {
      const hint = speakText(x.w).split("").map((c, i) => (i === 0 || /[\s\-']/.test(c) ? c : "_")).join("");
      prompt = `<div class="q-prompt ko">${esc(x.m)} <button class="icon-btn" data-act="speak" aria-label="발음 듣기">🔊</button></div><div class="spell-hint">${esc(hint)}</div>`;
    }
    const body = type === "spell"
      ? `<input class="spell-input" id="spell" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="영어로 입력" /><button class="btn btn-block" data-act="submit">확인</button>`
      : `<div class="choices">${s.cur.opts.map((o, i) => `<button class="choice" data-i="${i}"><span class="k">${i + 1}</span>${esc(type === "word" ? o.w : o.m)}</button>`).join("")}</div>`;
    app.innerHTML = `<div class="session">
      <div class="session-top"><button class="close-btn" data-act="close" aria-label="학습 끝내기">✕</button><div class="progress"><i style="width:${pct}%"></i></div><span class="combo">${s.combo >= 2 ? `🔥${s.combo}` : ""}</span></div>
      <div class="q-card fade-in">${sticker(Q_STICKER[type], "q-peek")}<span class="q-type">${QLABEL[type]}</span>${prompt}</div>
      ${body}
    </div>
    <div class="feedback" id="fb"><div class="feedback-inner"><img class="sticker fb-st" alt="" /><div class="msg"></div><button class="btn" data-act="next">계속하기</button></div></div>`;
    if (type === "listen" || type === "meaning") setTimeout(() => speak(x.w), 250);
    if (type === "spell") { const inp = $("#spell"); inp.focus(); inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !s.answered) { e.preventDefault(); e.stopPropagation(); submitSpell(); } }); }
  }

  function renderCard() {
    const s = session, x = s.list[s.ci];
    app.innerHTML = `<div class="session">
      <div class="session-top"><button class="close-btn" data-act="close" aria-label="학습 끝내기">✕</button><div class="progress"><i style="width:${(s.ci / s.list.length) * 100}%"></i></div><span class="combo" style="color:var(--ink-3)">${s.ci + 1}/${s.list.length}</span></div>
      <div class="flash fade-in" id="flash" role="button" tabindex="0" aria-label="카드 뒤집기">
        <div class="flash-inner">
          <div class="flash-face flash-front">${sticker("study", "flash-st")}<span class="num">No.${String(x.n).padStart(3, "0")}</span><div class="en">${esc(x.w)}</div><button class="icon-btn" data-act="speak" aria-label="발음 듣기">🔊</button><div class="hint">카드를 눌러 뜻을 확인하세요 · Space</div></div>
          <div class="flash-face flash-back">${sticker("idea", "flash-st")}<span class="num">No.${String(x.n).padStart(3, "0")}</span><div class="ko">${esc(x.m)}</div><div class="en">${esc(x.w)}</div><div class="hint">알고 있었나요?</div></div>
        </div>
      </div>
      <div class="two-btns"><button class="btn btn-dunno" data-act="dunno">🤔 몰라요</button><button class="btn btn-know" data-act="know">😎 알아요</button></div>
      <p class="muted" style="text-align:center;font-size:13px;margin-top:14px">카드를 다 보면 퀴즈로 확인해요 · <button data-act="skip" style="text-decoration:underline;color:var(--brand)">바로 퀴즈 풀기</button></p>
    </div>`;
    setTimeout(() => speak(x.w), 200);
    wordPhoto(x).then((p) => {
      if (!p || session !== s || s.stage !== "cards" || s.list[s.ci] !== x) return; // 그새 다음 카드로 넘어갔으면 무시
      const back = $(".flash-back");
      back.classList.add("has-photo");
      back.insertAdjacentHTML("afterbegin", `<figure class="photo" style="background:${esc(p.color || "#cfe6fb")}">
        <img src="${esc(p.regular)}" alt="${esc(p.alt)}" />
        <figcaption>Photo by <a href="${esc(p.authorLink)}" target="_blank" rel="noopener noreferrer">${esc(p.author)}</a> on <a href="${esc(p.unsplashLink)}" target="_blank" rel="noopener noreferrer">Unsplash</a></figcaption>
      </figure>`);
    });
    if (s.list[s.ci + 1]) preloadPhoto(s.list[s.ci + 1]);
  }

  function nextCard() {
    const s = session; s.ci++;
    if (s.ci >= s.list.length) { s.stage = "quiz"; toast("이제 퀴즈로 확인해 볼까요? 💪"); }
    renderSession();
  }

  function answer(ok, chosenEl) {
    const s = session, x = s.cur.x;
    if (s.answered) return; s.answered = true;
    const first = !s.graded.has(x.n);
    if (first) { s.graded.add(x.n); grade(x.n, ok); }
    if (ok) {
      s.combo++; s.best = Math.max(s.best, s.combo);
      const gain = 10 + (s.cur.type === "spell" ? 5 : 0) + Math.min(10, Math.floor(s.combo / 3) * 2);
      if (first) { s.correct++; } addXp(gain); s.xp += gain; xpPop(gain, chosenEl);
      if (s.combo % 5 === 0) { s.diff = Math.min(2, s.diff + 1); toast(`🔥 ${s.combo}연속 정답! 난이도 UP`); }
    } else {
      s.combo = 0; s.diff = Math.max(-1, s.diff - 1);
      if (!s.wrong.find((w) => w.n === x.n)) s.wrong.push(x);
      if (!s.retried.has(x.n)) { s.retried.add(x.n); s.queue.push(x); } // 틀린 단어는 세션 끝에 한 번 더
    }
    save(); updateTop();
    const fb = $("#fb");
    fb.className = `feedback show ${ok ? "good" : "bad"}`;
    fb.querySelector(".fb-st").src = `assets/stickers/${pick(ok ? CHEER : COMFORT)}.webp`;
    fb.querySelector(".msg").innerHTML = ok
      ? `<b>${["정답이에요!", "완벽해요!", "잘했어요!", "멋져요!"][Math.floor(Math.random() * 4)]}</b><span>${esc(x.w)} · ${esc(x.m)}</span>`
      : `<b>아쉬워요! 정답은</b><span><b style="display:inline;font-size:16px;color:var(--ink)">${esc(x.w)}</b> · ${esc(x.m)} — 곧 다시 나와요</span>`;
    if (!ok || s.cur.type !== "listen") speak(x.w);
    fb.querySelector("button").focus();
  }

  function submitSpell() {
    const inp = $("#spell"), v = inp.value.trim().toLowerCase().replace(/\s+/g, " ");
    if (!v) { inp.focus(); return; }
    const ok = answers(session.cur.x.w).includes(v);
    inp.classList.add(ok ? "correct" : "wrong"); inp.disabled = true;
    answer(ok, inp);
  }

  function renderResult() {
    const s = session, total = s.graded.size, acc = total ? Math.round((s.correct / total) * 100) : 0;
    const mood = acc === 100 ? "cheer" : acc >= 80 ? "high-five" : acc >= 50 ? "clap" : "comfort";
    const msg = acc === 100 ? "완벽해요! 모두 맞혔어요 🎉" : acc >= 80 ? "아주 잘했어요!" : acc >= 50 ? "좋아요, 조금만 더 힘내요!" : "괜찮아요, 복습하면 금방 외워져요!";
    app.innerHTML = `<div class="session result fade-in">
      ${sticker(mood, "result-st")}
      <h2>${msg}</h2><p class="muted">${esc(s.title)} 학습을 마쳤어요</p>
      <div class="result-stats">
        <div class="stat bg-sky"><div class="label">획득 XP</div><div class="value">+${s.xp}</div></div>
        <div class="stat bg-mint"><div class="label">정확도</div><div class="value">${acc}%</div></div>
        <div class="stat bg-peach"><div class="label">최고 콤보</div><div class="value">${s.best}</div></div>
      </div>
      ${s.wrong.length ? `<div class="card wrong-list"><h3 style="margin-bottom:6px">틀린 단어 ${s.wrong.length}개</h3><p class="muted" style="margin:0 0 6px;font-size:14px">10분 뒤 자동 복습에 다시 나와요.</p><ul>${s.wrong.map((x) => `<li><b>${esc(x.w)}</b><span class="muted">${esc(x.m)}</span></li>`).join("")}</ul></div>` : ""}
      <div class="two-btns">
        <a class="btn btn-ghost" href="#/">홈으로</a>
        ${(() => { const m = /#\/learn\/(\d+)/.exec(s.back); const d = m ? +m[1] : 0; return d && d < DAYS ? `<a class="btn" href="#/learn/${d + 1}">Day ${d + 1} 계속 →</a>` : `<a class="btn" href="#/review">복습하기 →</a>`; })()}
      </div>
    </div>`;
    session = null;
  }

  function endSession() {
    if (session && session.graded.size && !confirm("학습을 그만둘까요? 지금까지 푼 기록은 저장돼요.")) return;
    session = null; location.hash = "#/"; if (location.hash === "#/") route();
  }

  app.addEventListener("click", (e) => {
    if (!session) return;
    const a = e.target.closest("[data-act]");
    const act = a && a.dataset.act;
    if (act === "speak") { e.stopPropagation(); speak((session.cur && session.stage === "quiz" ? session.cur.x : session.list[session.ci]).w); return; }
    if (act === "close") return endSession();
    if (session.stage === "cards") {
      if (act === "know" || act === "dunno") return nextCard();
      if (act === "skip") { session.stage = "quiz"; return renderSession(); }
      if (e.target.closest("#flash a")) return; // 사진 출처 링크는 카드를 뒤집지 않고 그대로 열려요
      if (e.target.closest("#flash")) $("#flash").classList.toggle("flipped");
      return;
    }
    if (act === "submit") return submitSpell();
    if (act === "next") { session.qi++; return renderSession(); }
    const c = e.target.closest(".choice");
    if (c && !session.answered) {
      const opt = session.cur.opts[+c.dataset.i], ok = opt.n === session.cur.x.n;
      app.querySelectorAll(".choice").forEach((b, i) => { b.disabled = true; if (session.cur.opts[i].n === session.cur.x.n) b.classList.add("correct"); });
      if (!ok) c.classList.add("wrong");
      answer(ok, c);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (!session || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.id === "spell" && !session.answered) return;
    if (session.stage === "cards") {
      if (e.key === " ") { e.preventDefault(); $("#flash").classList.toggle("flipped"); }
      else if (e.key === "ArrowRight" || e.key === "Enter") nextCard();
      return;
    }
    if (session.answered && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); session.qi++; renderSession(); return; }
    if (!session.answered && /^[1-4]$/.test(e.key)) { const b = app.querySelectorAll(".choice")[+e.key - 1]; if (b) b.click(); }
  });

  /* ---------------- router ---------------- */
  function updateTop() {
    $("#streakCount").textContent = streakAlive();
    $("#xpCount").textContent = S.xp.toLocaleString();
  }
  function setNav(name) { document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === name)); }

  function emptyState(st, title, text, href, label) {
    app.innerHTML = `<div class="empty card fade-in">${sticker(st, "empty-st")}<h2>${title}</h2><p>${text}</p><a class="btn" href="${href}">${label}</a></div>`;
  }

  function route() {
    stopSpeech();
    session = null;
    const h = location.hash.replace(/^#\/?/, "");
    const [p, arg] = h.split("/");
    window.scrollTo(0, 0);
    if (p === "learn" && arg) {
      const d = Math.max(1, Math.min(DAYS, +arg || 1));
      setNav("learn");
      startSession({ list: dayWords(d), title: `Day ${d}`, cards: true });
    } else if (p === "learn") { setNav("learn"); viewLearn(); }
    else if (p === "review") {
      setNav("review");
      const due = dueList().sort((a, b) => ws(a.n).due - ws(b.n).due).slice(0, 20);
      if (!due.length) {
        const next = WORDS.map((x) => S.w[x.n]).filter((s) => s && s.b > 0 && !s.k).sort((a, b) => a.due - b.due)[0];
        const when = next ? Math.max(1, Math.round((next.due - Date.now()) / MIN)) : 0;
        emptyState("sleepy", "지금은 복습할 단어가 없어요", next ? `다음 복습은 약 ${when < 60 ? `${when}분` : when < 1440 ? `${Math.round(when / 60)}시간` : `${Math.round(when / 1440)}일`} 뒤에 찾아와요.` : "새 단어를 학습하면 잊을 만할 때 복습이 찾아와요.", `#/learn/${currentDay()}`, "새 단어 학습하기");
      } else startSession({ list: due, title: "자동 복습" });
    } else if (p === "wrong") {
      setNav("review");
      const l = shuffle(WORDS.filter((x) => ws(x.n).x > 0 && !mastered(x.n))).slice(0, 20);
      if (!l.length) emptyState("proud", "오답 노트가 비어 있어요", "틀린 단어가 생기면 여기에 모아 둘게요.", `#/learn/${currentDay()}`, "학습하러 가기");
      else startSession({ list: l, title: "오답 노트" });
    } else if (p === "words") { setNav("words"); viewWords(); }
    else if (p === "stats") { setNav("stats"); viewStats(); }
    else { setNav("home"); viewHome(); }
    updateTop();
  }

  window.addEventListener("hashchange", route);
  route();
})();
