// ══════════════════════════════════════════════════════════
// 뽑기 모듈 — 후보 매장 중 하나를 추첨. 세 가지 연출 방식:
//   • dart  : 손이 흔들리다 클릭하면 다트가 지도에 꽂히고, 지도가 확대되며 발표
//   • wheel : "돌리기!"를 누르면 룰렛 휠이 돌아 포인터에 멈춤
//   • gacha : 후보 "전원"이 구슬로 통에서 구르다, 클릭하면 뽑기 연출 시작
// 방식은 상단 토글로 고르고 localStorage에 기억한다 (기본: dart).
//
// 공정성: 당첨자는 항상 전체 후보에서 균등 추첨.
// 휠만 라벨 가독성 때문에 최대 8곳을 무대에 올린다(당첨자 포함).
// 발표(reveal)는 rAF가 아니라 setTimeout으로 확정한다 (백그라운드 탭 안전).
// ══════════════════════════════════════════════════════════
import { SUB_EMOJI } from './filters.js';
import { kakaoMapUrl, shareStore } from './share.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const WHEEL_SEG = 12;       // 휠에 보이는 조각 수 (추첨은 전체 후보에서, 당첨자는 항상 포함)
const WHEEL_ZOOM_MS = 950;  // 멈춘 뒤 확대+상호명 유지 시간
const TURNS = 7;            // 룰렛 회전 바퀴 수
const WHEEL_MS = 5200;      // 룰렛: 클릭 후 연출 시간
const GACHA_DRAW_MS = 4600; // 구슬: 클릭 후 연출 시간
const DART_MS = 3900;       // 다트: 클릭 후 연출 시간 (조준→비행→명중→확대)

const BALL_COLORS = ['#FF385C', '#FFB400', '#00A699', '#7B61FF', '#1A73E8', '#FF8A00', '#E61E4D', '#34C759'];

// 룰렛 세그먼트 색 — 인접 구분 + 글자 대비 4.5:1 이상 유지
function segColor(i, n) {
  if (n === 1) return { bg: '#E61E4D', fg: '#FFFFFF' };
  if (i === n - 1 && n % 2 === 1) return { bg: '#FFC9D4', fg: '#222222' };
  return i % 2 === 0
    ? { bg: '#E61E4D', fg: '#FFFFFF' }
    : { bg: '#FFE3E9', fg: '#222222' };
}

const polar = (cx, cy, r, deg) => {
  const a = deg * Math.PI / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const short = (s, n = 6) => (s.length > n + 1 ? s.slice(0, n) + '…' : s);

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const prefersReduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createRoulette({ toast, onWin }) {
  const $ = id => document.getElementById(id);
  const modal = $('rouletteModal'), statusEl = $('wheelStatus'),
        dartStage = $('dartStage'), wheelStage = $('wheelStage'), gachaStage = $('gachaStage'),
        dartSvg = $('dartSvg'), wheelSvg = $('wheelSvg'), gachaSvg = $('gachaSvg'),
        modeDartBtn = $('modeDart'), modeWheelBtn = $('modeWheel'), modeGachaBtn = $('modeGacha'),
        dartThrowBtn = $('dartThrow'), wheelGoBtn = $('wheelGo'), gachaDrawBtn = $('gachaDraw'),
        wheelClip = wheelStage.querySelector('.wheel-clip'), wheelName = $('wheelName'),
        resultEl = $('resultCard'), emojiEl = $('resultEmoji'), nameEl = $('resultName'),
        metaEl = $('resultMeta'), addrEl = $('resultAddr'), mapLink = $('resultMapLink'),
        shareBtn = $('shareBtn'), respinBtn = $('respinBtn'),
        closeBtn = $('modalClose'), backdrop = $('modalBackdrop');

  let mode = 'dart';     // 항상 다트 뽑기로 시작 (기본)
  let candidates = [];   // 이번 추첨의 전체 후보
  let winner = null;
  let spinning = false;
  let armed = false;     // 대기 상태(클릭으로 연출 시작)
  let lastFocus = null;  // 닫을 때 포커스 복귀용

  // 룰렛 상태
  let wheelG = null, rotation = 0, curSeats = [];
  // 구슬 상태
  let balls = [], rafId = 0, speedMul = 1, curBallR = 12;
  // 다트 상태
  let dartImpact = { ix: 100, iy: 80 };
  // 연출 타이머 (모드 전환·닫기 시 일괄 취소)
  let revealTimer = 0;
  let phaseTimers = [];
  const later = (fn, ms) => { const id = setTimeout(fn, ms); phaseTimers.push(id); return id; };
  const setStatus = msg => { statusEl.textContent = msg; };

  const GACHA_MAX_BALLS = 60;   // 구슬 애니메이션 성능 상한 (당첨자는 항상 포함)

  // ── 전체 후보에서 당첨자 균등 추첨 ──
  function drawWinner(list) {
    return list[Math.floor(Math.random() * list.length)];
  }
  // 당첨자를 반드시 포함하되 시각 참가자를 cap개로 샘플링
  function sampleWith(list, win, cap) {
    if (list.length <= cap) return shuffle([...list]);
    const others = shuffle(list.filter(s => s !== win)).slice(0, cap - 1);
    return shuffle(others.concat(win));
  }

  // ════════════════ 다트 뽑기 ════════════════
  const dartWrap = () => dartStage.querySelector('.dart-wrap');

  // 위(지도)를 향한 다트 모양 — 촉은 위, 깃은 아래
  const dartShape = (x, y) => `<g>
    <line x1="${x}" y1="${y}" x2="${x}" y2="${y - 26}" style="stroke:var(--text)" stroke-width="3" stroke-linecap="round"/>
    <path d="M${x} ${y - 34} l-4.5 9 h9 Z" fill="#E61E4D"/>
    <path d="M${x - 6.5} ${y + 1} l6.5 -8 l6.5 8 l-6.5 5 Z" fill="#FF385C"/>
  </g>`;

  function buildDart() {
    // 임팩트 지점: 지도 안쪽 무작위
    dartImpact = { ix: 40 + Math.random() * 120, iy: 34 + Math.random() * 92 };
    const { ix, iy } = dartImpact;
    dartSvg.innerHTML = `
      <defs><clipPath id="dartClip"><rect x="8" y="8" width="184" height="148" rx="14"/></clipPath></defs>
      <rect x="6" y="6" width="188" height="152" rx="16" fill="none" stroke="#DDDDDD" stroke-width="2.5"/>
      <g clip-path="url(#dartClip)">
        <g id="dartZoom" style="transform-box:view-box;transform-origin:${ix}px ${iy}px">
          <rect x="8" y="8" width="184" height="148" fill="#EFEDE6"/>
          <g stroke="#FFFFFF" stroke-width="5">
            <line x1="8" y1="52" x2="192" y2="52"/><line x1="8" y1="106" x2="192" y2="106"/>
            <line x1="58" y1="8" x2="58" y2="156"/><line x1="122" y1="8" x2="122" y2="156"/><line x1="166" y1="8" x2="166" y2="156"/>
          </g>
          <rect x="16" y="14" width="34" height="30" rx="9" fill="#DEEBD6"/>
          <path d="M148 156 q12 -38 44 -32 l0 32 Z" fill="#D8E7F2"/>
          <rect x="66" y="60" width="26" height="20" rx="4" fill="#E4E0D6"/>
          <rect x="130" y="114" width="30" height="22" rx="4" fill="#E4E0D6"/>
          <rect x="24" y="114" width="24" height="18" rx="4" fill="#E4E0D6"/>
          <g id="dartStuck" opacity="0" style="transform-box:view-box;transform-origin:${ix}px ${iy}px">
            <g stroke="#E61E4D" stroke-width="2" stroke-linecap="round">
              <line x1="${ix - 8}" y1="${iy - 8}" x2="${ix - 14}" y2="${iy - 14}"/>
              <line x1="${ix + 8}" y1="${iy - 8}" x2="${ix + 14}" y2="${iy - 14}"/>
              <line x1="${ix - 8}" y1="${iy + 8}" x2="${ix - 14}" y2="${iy + 14}"/>
              <line x1="${ix + 8}" y1="${iy + 8}" x2="${ix + 14}" y2="${iy + 14}"/>
            </g>
            <circle cx="${ix}" cy="${iy}" r="4.5" fill="#E61E4D" stroke="#FFFFFF" stroke-width="1.5"/>
            <line x1="${ix}" y1="${iy}" x2="${ix + 13}" y2="${iy - 19}" stroke="#222222" stroke-width="2.5" stroke-linecap="round"/>
            <path d="M${ix + 13} ${iy - 19} l2 -8 l6 5 Z" fill="#E61E4D"/>
          </g>
        </g>
        <!-- 명중 순간 퍼지는 충격 링 -->
        <circle id="dartFlash" cx="${ix}" cy="${iy}" r="7" fill="none" stroke="#E61E4D" stroke-width="3"
                opacity="0" style="transform-box:view-box;transform-origin:${ix}px ${iy}px"/>
        <!-- 조준 레티클 (던지기 전 콩콩 뛰며 조준) -->
        <g id="dartReticle" style="transform-box:view-box;transform-origin:${ix}px ${iy}px">
          <circle cx="${ix}" cy="${iy}" r="13" fill="none" stroke="#E61E4D" stroke-width="2"/>
          <line x1="${ix - 19}" y1="${iy}" x2="${ix - 6}" y2="${iy}" stroke="#E61E4D" stroke-width="2"/>
          <line x1="${ix + 6}" y1="${iy}" x2="${ix + 19}" y2="${iy}" stroke="#E61E4D" stroke-width="2"/>
          <line x1="${ix}" y1="${iy - 19}" x2="${ix}" y2="${iy - 6}" stroke="#E61E4D" stroke-width="2"/>
          <line x1="${ix}" y1="${iy + 6}" x2="${ix}" y2="${iy + 19}" stroke="#E61E4D" stroke-width="2"/>
        </g>
      </g>
      <g id="flyDart" opacity="0" style="transform-box:view-box;transform-origin:100px 190px">
        ${dartShape(100, 190)}
      </g>
      <g id="dartHand" class="wobble" style="transform-box:view-box;transform-origin:100px 208px">
        ${dartShape(100, 190)}
        <text x="100" y="220" font-size="30" text-anchor="middle" aria-hidden="true">✊</text>
      </g>
    `;
  }

  function idleDart() {
    armed = true;
    dartThrowBtn.hidden = false;
    dartWrap()?.classList.add('armed');
    dartSvg.querySelector('#dartReticle')?.classList.add('pulse');   // 조준 중 콩콩
    setStatus(`후보 ${candidates.length}곳이 지도 위에… 조준! 던져서 정해요 🎯`);
  }

  function runDartThrow() {
    if (!armed || mode !== 'dart') return;
    armed = false;
    dartThrowBtn.hidden = true;
    dartWrap()?.classList.remove('armed');
    const win = winner;
    if (prefersReduced()) { revealTimer = setTimeout(() => reveal(win), 400); return; }

    const hand = dartSvg.querySelector('#dartHand');
    const fly = dartSvg.querySelector('#flyDart');
    const stuck = dartSvg.querySelector('#dartStuck');
    const zoom = dartSvg.querySelector('#dartZoom');
    const flash = dartSvg.querySelector('#dartFlash');
    const reticle = dartSvg.querySelector('#dartReticle');
    const { ix, iy } = dartImpact;

    reticle?.classList.remove('pulse');
    setStatus('조준… 조준… 🎯');

    // 손: 흔들기 멈추고 뒤로 당겼다(장전) 던지는 반동
    hand.classList.remove('wobble');
    hand.style.transition = 'transform .18s ease-out';
    hand.style.transform = 'rotate(9deg) translateY(9px)';

    // 1) 장전 후 발사 — 다트가 아치를 그리며 날아감 (정점 → 낙하 2단)
    later(() => {
      setStatus('던졌다…! 🎯');
      hand.style.transition = 'transform .12s ease-in, opacity .3s';
      hand.style.transform = 'rotate(-15deg) translateY(2px)';
      const peakX = 100 + (ix - 100) * 0.5, peakY = Math.min(iy, 190) - 74;
      fly.style.opacity = '1';
      fly.style.transition = 'none';
      void fly.getBoundingClientRect();
      fly.style.transition = 'transform .24s cubic-bezier(.2,.5,.5,1)';
      fly.style.transform = `translate(${peakX - 100}px, ${peakY - 190}px) scale(.7) rotate(10deg)`;
      later(() => {   // 정점 → 임팩트로 낙하
        fly.style.transition = 'transform .28s cubic-bezier(.5,.1,.7,1)';
        fly.style.transform = `translate(${ix - 100}px, ${iy - 190}px) scale(.4) rotate(22deg)`;
      }, 240);
    }, 220);

    // 2) 명중: 꽂힌 다트(바운스) + 충격 링 + 지도 흔들림
    later(() => {
      fly.style.opacity = '0';
      hand.style.opacity = '0';
      reticle.style.opacity = '0';
      stuck.setAttribute('opacity', '1');
      stuck.classList.add('land');
      flash.classList.add('flash');
      dartWrap()?.classList.add('shake');
      setStatus('명중!! 💥');
    }, 760);

    // 3) 확대: 꽂힌 곳으로 점점 줌인
    later(() => {
      dartWrap()?.classList.remove('shake');
      setStatus('여기가 어디냐면… 👀');
      zoom.style.transition = 'transform 1.7s cubic-bezier(.4,0,.2,1)';
      zoom.style.transform = 'scale(3)';
    }, 1360);
    revealTimer = setTimeout(() => reveal(win), DART_MS);
  }

  // ════════════════ 룰렛 ════════════════
  // 멈춤 확대·상호명 초기화
  function resetWheelZoom() {
    wheelClip.classList.remove('zoom');
    wheelName.hidden = true;
    wheelName.classList.remove('show');
  }

  function buildWheel(seats) {
    resetWheelZoom();
    const n = seats.length, seg = 360 / n;
    const showText = true;      // 12조각이라 항상 이름 라벨 표시
    const sw = 1.5;
    let inner = '';
    for (let i = 0; i < n; i++) {
      const { bg, fg } = segColor(i, n);
      const a0 = -90 + i * seg, mid = a0 + seg / 2;
      if (n === 1) {
        inner += `<circle cx="100" cy="100" r="96" fill="${bg}"/>`;
      } else {
        const [x0, y0] = polar(100, 100, 96, a0);
        const [x1, y1] = polar(100, 100, 96, a0 + seg);
        inner += `<path d="M100 100 L${x0.toFixed(2)} ${y0.toFixed(2)} A96 96 0 ${seg > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z" fill="${bg}" stroke="#FFFFFF" stroke-width="${sw}"/>`;
      }
      if (showText) {
        const [tx, ty] = polar(100, 100, 60, mid);
        const norm = ((mid % 360) + 360) % 360;
        const rot = (norm > 90 && norm < 270) ? mid + 180 : mid;
        inner += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" fill="${fg}" font-size="10" font-weight="700" text-anchor="middle" dominant-baseline="middle" transform="rotate(${rot.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)})">${esc(short(seats[i].name))}</text>`;
      }
    }
    wheelSvg.innerHTML =
      `<g id="wheelG" style="transform-box:view-box;transform-origin:50% 50%;transform:rotate(${rotation}deg)">${inner}</g>` +
      `<circle cx="100" cy="100" r="15" fill="#FFFFFF" stroke="#DDDDDD" stroke-width="1.5"/>` +
      `<circle cx="100" cy="100" r="4.5" fill="#E61E4D"/>`;
    wheelG = wheelSvg.querySelector('#wheelG');
  }

  function idleWheel() {
    armed = true;
    wheelGoBtn.hidden = false;
    setStatus(candidates.length > WHEEL_SEG
      ? `후보 ${candidates.length}곳에서 추첨! 돌려주세요 🎡👇`
      : `후보 ${candidates.length}곳 — 돌려주세요! 🎡👇`);
  }

  function runWheelSpin() {
    if (!armed || mode !== 'wheel') return;
    armed = false;
    wheelGoBtn.hidden = true;

    const seats = curSeats, win = winner;
    const n = seats.length, seg = 360 / n, i = seats.indexOf(win);
    const jitter = (Math.random() - 0.5) * seg * 0.6;
    // 당첨 세그먼트 중심이 12시 포인터에 오도록 회전량 계산
    const targetMod = (((-(i + 0.5) * seg + jitter) % 360) + 360) % 360;
    const delta = ((targetMod - rotation) % 360 + 360) % 360 + 360 * TURNS;
    rotation += delta;

    if (prefersReduced()) {
      wheelG.style.transition = 'none';
      wheelG.style.transform = `rotate(${rotation}deg)`;
      revealTimer = setTimeout(() => reveal(win), 450);
      return;
    }
    // 막판까지 힘있게 돌다 마지막에 뚝 감속 → 쫄깃한 정지감
    wheelG.style.transition = 'none';
    void wheelG.getBoundingClientRect();
    wheelG.style.transition = `transform ${WHEEL_MS}ms cubic-bezier(.08,.62,.12,1)`;
    wheelG.style.transform = `rotate(${rotation}deg)`;

    setStatus('힘차게 돌립니다… 🎡');
    later(() => setStatus('두구두구두구 🥁'), WHEEL_MS * 0.35);
    later(() => setStatus('어디서 멈출까… 🤞'), WHEEL_MS * 0.68);
    later(() => setStatus('거의… 거의…! 😳'), WHEEL_MS * 0.88);
    // 멈춘 뒤: 당첨 조각으로 확대 + 상호명 → 잠깐 뒤 결과 발표
    revealTimer = setTimeout(() => {
      wheelClip.classList.add('zoom');
      wheelName.textContent = win.name;
      wheelName.hidden = false;
      later(() => wheelName.classList.add('show'), 30);
      setStatus('여기닷…! 👀');
      later(() => reveal(win), WHEEL_ZOOM_MS);
    }, WHEEL_MS + 200);
  }

  // ════════════════ 구슬 뽑기 (후보 전원이 구슬로 참여) ════════════════
  const CX = 100, CY = 96, DRUM_R = 82;
  const gachaWrap = () => gachaStage.querySelector('.gacha-wrap');

  // 구슬 수에 따라 반지름 축소 — 전원이 통에 들어가도 안 터지게
  const ballRadius = n => (n <= 8 ? 12 : n <= 16 ? 10 : n <= 30 ? 8 : 6.5);

  function buildGacha(seats) {
    curBallR = ballRadius(seats.length);
    gachaSvg.innerHTML = `
      <circle cx="${CX}" cy="${CY}" r="${DRUM_R + 4}" fill="#FFFFFF" stroke="#E61E4D" stroke-width="4"/>
      <circle cx="${CX}" cy="${CY}" r="${DRUM_R}" fill="#FFF4F6"/>
      <circle cx="${CX}" cy="${CY}" r="${DRUM_R}" fill="none" stroke="#FFC9D4" stroke-width="2"/>
      <path d="M${CX - 44} ${CY - 46} a58 58 0 0 1 34 -20" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" opacity=".8"/>
      <rect x="${CX - 15}" y="${CY + DRUM_R - 6}" width="30" height="34" rx="7" fill="#FFE3E9" stroke="#E61E4D" stroke-width="3"/>
      <rect x="${CX - 34}" y="${CY + DRUM_R + 26}" width="68" height="16" rx="8" fill="#E61E4D"/>
      <g id="gachaBalls"></g>
    `;
    const g = gachaSvg.querySelector('#gachaBalls');
    balls = seats.map((s, i) => {
      const el = document.createElementNS(SVGNS, 'circle');
      el.setAttribute('r', curBallR);
      el.setAttribute('fill', BALL_COLORS[i % BALL_COLORS.length]);
      el.setAttribute('stroke', '#FFFFFF');
      el.setAttribute('stroke-width', '1.5');
      g.appendChild(el);
      const b = {
        el, seat: s, frozen: false,
        angle: Math.random() * Math.PI * 2,
        speed: (0.05 + Math.random() * 0.06) * (Math.random() < 0.5 ? -1 : 1),
        rBase: 14 + Math.random() * (DRUM_R - curBallR - 18),
        wob: 5 + Math.random() * 9,
        wobSpeed: 0.003 + Math.random() * 0.004,
        phase: Math.random() * Math.PI * 2,
      };
      place(b, 0);
      return b;
    });
  }

  function place(b, ts) {
    const rad = Math.min(b.rBase + Math.sin(ts * b.wobSpeed + b.phase) * b.wob, DRUM_R - curBallR - 3);
    b.el.setAttribute('cx', (CX + rad * Math.cos(b.angle)).toFixed(2));
    b.el.setAttribute('cy', (CY + rad * Math.sin(b.angle)).toFixed(2));
  }

  function tumble(ts) {
    for (const b of balls) {
      if (b.frozen) continue;
      b.angle += b.speed * speedMul;
      place(b, ts);
    }
    rafId = requestAnimationFrame(tumble);
  }

  function tweenBall(b, tx, ty, dur, done) {
    const sx = +b.el.getAttribute('cx'), sy = +b.el.getAttribute('cy');
    let start = null;
    (function step(ts) {
      if (start === null) start = ts;
      const t = Math.min(1, (ts - start) / dur), e = t * t * (3 - 2 * t);
      b.el.setAttribute('cx', (sx + (tx - sx) * e).toFixed(2));
      b.el.setAttribute('cy', (sy + (ty - sy) * e).toFixed(2));
      if (t < 1) requestAnimationFrame(step); else done && done();
    })(0);
  }

  function rejoin(b) {
    const cx = +b.el.getAttribute('cx'), cy = +b.el.getAttribute('cy');
    b.angle = Math.atan2(cy - CY, cx - CX);
    b.rBase = Math.min(Math.hypot(cx - CX, cy - CY), DRUM_R - curBallR - 3);
    b.wob = 4 + Math.random() * 8;
    b.frozen = false;
  }

  function shake(on) {
    gachaWrap()?.classList.toggle('shake', on);
  }

  // 페이크아웃: 당첨이 아닌 구슬이 배출구까지 올라왔다가 다시 쏙 들어감
  function fakeOut(win) {
    const pool = balls.filter(b => b.seat !== win && !b.frozen);
    if (!pool.length) return;
    const decoy = pool[Math.floor(Math.random() * pool.length)];
    decoy.frozen = true;
    decoy.el.parentNode.appendChild(decoy.el);
    setStatus('어? 이거 나온다…?! 🫣');
    tweenBall(decoy, CX, CY + DRUM_R - 8, 560, () => {
      later(() => tweenBall(decoy, CX + (Math.random() * 44 - 22), CY + 6, 520, () => rejoin(decoy)), 300);
    });
  }

  // 최종: 당첨 구슬이 천천히 배출구로 올라와 잠깐 멈췄다가 뚝 떨어짐
  function finalDraw(win) {
    shake(false);
    const wb = balls.find(b => b.seat === win);
    setStatus('두구두구… 잡았다…?! 🎯');
    if (!wb) return;
    wb.frozen = true;
    wb.el.setAttribute('r', 12); // 당첨 구슬은 커지며 주인공으로
    wb.el.parentNode.appendChild(wb.el);
    for (const b of balls) {
      if (b !== wb) { b.el.style.transition = 'opacity .6s'; b.el.style.opacity = '.22'; }
    }
    tweenBall(wb, CX, CY + DRUM_R - 4, 780, () => {
      later(() => tweenBall(wb, CX, CY + DRUM_R + 30, 420), 320);
    });
  }

  function idleGacha() {
    armed = true;
    gachaDrawBtn.hidden = false;
    gachaWrap()?.classList.add('armed');
    setStatus(candidates.length > balls.length
      ? `후보 ${candidates.length}곳에서 추첨! 구슬 ${balls.length}개 데굴데굴 — 눌러서 뽑기! 👇`
      : `구슬 ${balls.length}개가 데굴데굴 — 눌러서 뽑기! 👇`);
    if (prefersReduced()) return;
    speedMul = 1.2;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tumble);
  }

  function runGachaDraw() {
    if (!armed || mode !== 'gacha') return;
    armed = false;
    gachaDrawBtn.hidden = true;
    gachaWrap()?.classList.remove('armed');
    const win = winner;
    if (prefersReduced()) { revealTimer = setTimeout(() => reveal(win), 400); return; }
    speedMul = 1.9; shake(true);
    setStatus('두구두구두구 🥁');
    later(() => { shake(false); fakeOut(win); }, 800);
    later(() => setStatus('에이~ 아니네 😮‍💨'), 2100);
    later(() => { speedMul = 2.4; shake(true); setStatus('마지막이다 두구두구!! 🥁'); }, 2200);
    later(() => finalDraw(win), 2900);
    revealTimer = setTimeout(() => reveal(win), GACHA_DRAW_MS);
  }

  // ════════════════ 공통 ════════════════
  // 당첨 축하 — 폭죽(사방으로 팡) + 꽃가루(팔랑팔랑 낙하)
  function fireConfetti() {
    if (prefersReduced()) return;
    const host = modal.querySelector('.modal-box');
    const layer = document.createElement('div');
    layer.className = 'celebrate';
    layer.setAttribute('aria-hidden', 'true');

    // 폭죽 3발 — 각 지점에서 사방으로 퍼짐
    const bursts = [[28, 34], [72, 30], [50, 46]];
    bursts.forEach(([bx, by], b) => {
      for (let i = 0; i < 20; i++) {
        const ang = (Math.PI * 2 * i) / 20 + Math.random() * 0.3;
        const dist = 55 + Math.random() * 75;
        const p = document.createElement('i');
        p.className = 'fw';
        p.style.left = bx + '%';
        p.style.top = by + '%';
        p.style.setProperty('--x', (Math.cos(ang) * dist).toFixed(1) + 'px');
        p.style.setProperty('--y', (Math.sin(ang) * dist).toFixed(1) + 'px');
        p.style.setProperty('--t', (0.7 + Math.random() * 0.5) + 's');
        p.style.background = BALL_COLORS[(i + b) % BALL_COLORS.length];
        p.style.animationDelay = (b * 0.18 + Math.random() * 0.15) + 's';
        layer.appendChild(p);
      }
    });
    // 꽃가루 — 위에서 팔랑팔랑
    for (let i = 0; i < 46; i++) {
      const p = document.createElement('i');
      p.className = 'cf';
      p.style.left = (Math.random() * 100) + '%';
      p.style.top = '4%';
      p.style.setProperty('--x', (Math.random() * 140 - 70).toFixed(1) + 'px');
      p.style.setProperty('--y', (150 + Math.random() * 170).toFixed(1) + 'px');
      p.style.setProperty('--r', (Math.random() * 720 - 360).toFixed(0) + 'deg');
      p.style.setProperty('--t', (1.1 + Math.random() * 0.9) + 's');
      p.style.background = BALL_COLORS[i % BALL_COLORS.length];
      p.style.animationDelay = (Math.random() * 0.6) + 's';
      layer.appendChild(p);
    }

    host.appendChild(layer);
    setTimeout(() => layer.remove(), 3000);
  }

  function reveal(win) {
    spinning = false;
    respinBtn.disabled = false;
    shake(false);
    emojiEl.textContent = SUB_EMOJI[win.sub] ?? '🍽';
    nameEl.textContent = win.name;
    const ratingHtml = win.rating ? `<span><span class="star" aria-hidden="true">★</span> ${win.rating.toFixed(1)}</span>` : '';
    metaEl.innerHTML = `<span class="badge">${esc(win.sub)}</span>${ratingHtml}<span>${win.dist}m</span>`;
    addrEl.textContent = win.addr;
    mapLink.href = kakaoMapUrl(win);
    resultEl.hidden = false;
    resultEl.classList.remove('win-pop');
    void resultEl.offsetWidth;
    resultEl.classList.add('win-pop');
    fireConfetti();
    statusEl.textContent = `🎉 당첨! ${win.name}`;
    nameEl.focus();
    onWin?.(win);   // 홈 화면 당첨 배너에도 반영
  }

  function clearTimers() {
    clearTimeout(revealTimer);
    phaseTimers.forEach(clearTimeout);
    phaseTimers = [];
    cancelAnimationFrame(rafId);
  }

  function hideGoButtons() {
    dartThrowBtn.hidden = true;
    wheelGoBtn.hidden = true;
    gachaDrawBtn.hidden = true;
  }

  function start() {
    clearTimers();
    shake(false);
    armed = false;
    hideGoButtons();
    winner = drawWinner(candidates);
    resultEl.hidden = true;
    spinning = true;
    respinBtn.disabled = true;
    if (mode === 'dart') {
      buildDart();
      idleDart();
    } else if (mode === 'wheel') {
      rotation %= 360;
      // 추첨은 전체 후보에서(winner). 휠엔 당첨자 포함 12조각만 보기 좋게.
      curSeats = sampleWith(candidates, winner, WHEEL_SEG);
      buildWheel(curSeats);
      idleWheel();
    } else {
      buildGacha(sampleWith(candidates, winner, GACHA_MAX_BALLS));
      idleGacha();
    }
  }

  function applyMode() {
    modeDartBtn.setAttribute('aria-pressed', String(mode === 'dart'));
    modeWheelBtn.setAttribute('aria-pressed', String(mode === 'wheel'));
    modeGachaBtn.setAttribute('aria-pressed', String(mode === 'gacha'));
    dartStage.hidden = mode !== 'dart';
    wheelStage.hidden = mode !== 'wheel';
    gachaStage.hidden = mode !== 'gacha';
  }

  function setMode(next) {
    if (mode === next) return;
    mode = next;
    applyMode();
    start(); // 방식 바꾸면 새로 뽑기
  }

  function open(list) {
    if (!list.length) return;
    candidates = list;
    mode = 'dart';        // 뽑기 시작하면 항상 다트부터
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    applyMode();
    closeBtn.focus();
    start();
  }

  function close() {
    clearTimers();
    spinning = false;
    armed = false;
    hideGoButtons();
    resetWheelZoom();
    shake(false);
    modal.hidden = true;
    document.body.style.overflow = '';
    lastFocus?.focus();
  }

  // ── 이벤트 ──
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  modeDartBtn.addEventListener('click', () => setMode('dart'));
  modeWheelBtn.addEventListener('click', () => setMode('wheel'));
  modeGachaBtn.addEventListener('click', () => setMode('gacha'));
  dartThrowBtn.addEventListener('click', runDartThrow);
  dartSvg.addEventListener('click', runDartThrow);     // 지도를 직접 눌러도 던짐
  wheelGoBtn.addEventListener('click', runWheelSpin);
  wheelSvg.addEventListener('click', runWheelSpin);    // 휠을 직접 눌러도 돌림
  gachaDrawBtn.addEventListener('click', runGachaDraw);
  gachaSvg.addEventListener('click', runGachaDraw);    // 통을 직접 눌러도 뽑음
  respinBtn.addEventListener('click', () => { if (!spinning || armed) start(); });
  shareBtn.addEventListener('click', async () => {
    if (!winner) return;
    const r = await shareStore(winner);
    if (r === 'copied') toast('📋 추천 문구를 복사했어요 — 친구에게 붙여넣으세요!');
    else if (r === 'failed') toast('이 브라우저에서는 공유가 지원되지 않아요 😢');
  });
  document.addEventListener('keydown', e => {
    if (modal.hidden) return;
    if (e.key === 'Escape') { close(); return; }
    // 간단한 포커스 트랩
    if (e.key === 'Tab') {
      const f = [...modal.querySelectorAll('button, a[href]')].filter(el => el.offsetParent !== null && !el.disabled);
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  return { open };
}
