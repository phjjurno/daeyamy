// ══════════════════════════════════════════════════════════
// 지도 모듈 — PART 1: 목업 지도
// PART 2에서 카카오맵 SDK로 교체할 수 있게 컨트롤러 인터페이스
// { render, focus, locate } 만 밖으로 노출한다.
// ══════════════════════════════════════════════════════════
import { SUB_EMOJI } from './filters.js';

export function createMapController(rootEl, { onMarkerClick }) {
  // ── 정적 배경: 도로 격자 + 공원 + 물길 + 건물 블록 + 길 이름 ──
  rootEl.innerHTML = `
    <div class="mm-bg" aria-hidden="true"></div>
    <div class="mm-park" aria-hidden="true"></div>
    <div class="mm-water" aria-hidden="true"></div>
    <div class="mm-block" style="left:33%;top:12%;width:14%;height:13%" aria-hidden="true"></div>
    <div class="mm-block" style="left:57%;top:57%;width:12%;height:15%" aria-hidden="true"></div>
    <div class="mm-block" style="left:12%;top:56%;width:10%;height:11%" aria-hidden="true"></div>
    <span class="mm-label" style="left:8%;top:10%" aria-hidden="true">대얌공원</span>
    <span class="mm-label" style="left:40%;top:90%" aria-hidden="true">룰렛대로</span>
    <span class="mm-label" style="left:74%;top:16%" aria-hidden="true">오늘로</span>
    <div class="mm-markers"></div>
    <div class="mm-me" role="img" aria-label="내 위치"></div>
  `;
  const markerLayer = rootEl.querySelector('.mm-markers');
  const meDot = rootEl.querySelector('.mm-me');
  let markerEls = new Map(); // 매장 id → 마커 엘리먼트

  return {
    // 후보 매장들을 마커로 다시 그림
    render(stores, selectedId = null) {
      markerLayer.innerHTML = '';
      markerEls = new Map();
      for (const s of stores) {
        const btn = document.createElement('button');
        btn.className = 'marker' + (s.id === selectedId ? ' selected' : '');
        btn.dataset.sub = s.sub;
        btn.style.left = s.x + '%';
        btn.style.top = s.y + '%';
        btn.setAttribute('aria-label', `${s.name} — ${s.sub}, 별점 ${s.rating}, ${s.dist}m`);
        btn.innerHTML = `
          <span class="marker-name">${s.name}</span>
          <span class="marker-pin" aria-hidden="true">${SUB_EMOJI[s.sub] ?? '📍'}</span>
        `;
        btn.addEventListener('click', () => onMarkerClick(s.id));
        markerLayer.appendChild(btn);
        markerEls.set(s.id, btn);
      }
    },

    // 특정 매장 마커를 강조
    focus(id) {
      for (const [sid, el] of markerEls) el.classList.toggle('selected', sid === id);
    },

    // 내 위치 강조 (목업: 중앙 고정, 펄스 애니메이션 재생)
    locate() {
      meDot.style.animation = 'none';
      void meDot.offsetWidth; // 리플로우로 애니메이션 리셋
      meDot.style.animation = '';
    },

    // 카카오 전용 기능 — 목업에선 no-op (app.js가 동일 인터페이스로 호출)
    isKakao: false,
    setScope() {},
    renderParking() {},
    clearParking() {},
  };
}
