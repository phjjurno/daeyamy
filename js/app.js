// ══════════════════════════════════════════════════════════
// 앱 진입점 — 상태 관리 + 렌더링 + 이벤트 연결
// ══════════════════════════════════════════════════════════
import { STORES } from './data.js';
import { CATS, SUBCATS, SUB_EMOJI, getCandidates } from './filters.js';
import { createMapController } from './map.js';
import { createRoulette } from './roulette.js';
import { kakaoMapUrl } from './share.js';
import { CONFIG } from './config.js';

// ── 전역 상태 ──
const state = {
  cat: 'food',                 // 현재 카테고리 (food | cafe | pub)
  excluded: {                  // 카테고리별 제외된 하위 종류
    food: new Set(), cafe: new Set(), pub: new Set(),
  },
  query: '',                   // 이름 필터(목업 모드에서만 사용)
  sort: 'distance',            // 정렬 기준
  selectedId: null,            // 선택(강조)된 매장
  // 카카오 모드 전용
  isKakao: false,
  center: null,                // 현재 검색 중심 {lat,lng}
  radius: CONFIG.SEARCH_RADIUS,// 검색 반경(m)
  travelMode: null,            // null | 'walk' | 'car'
};

// ── DOM 참조 ──
const $ = id => document.getElementById(id);
const tabsEl = $('tabs'), chipsEl = $('chips'), listEl = $('storeList'),
      countEl = $('count'), emptyEl = $('emptyState'),
      spinBtn = $('spinBtn'), spinBtnText = $('spinBtnText'),
      searchInput = $('searchInput'), searchForm = $('searchForm'),
      sortSelect = $('sortSelect'), locateBtn = $('locateBtn'), toastEl = $('toast'),
      scopeRow = $('scopeRow'), radiusSelect = $('radiusSelect'), radiusLabel = $('radiusLabel'),
      travelWalk = $('travelWalk'), travelCar = $('travelCar'), parkingBtn = $('parkingBtn');

let activeStores = STORES;   // 기본: 더미 데이터 (카카오 연동 시 실매장으로 교체)
let map;                     // 지도 컨트롤러 — boot()에서 목업/카카오 중 선택
let kakao = null;            // 로드된 카카오 모듈 (카카오 모드에서만)

const fmtRadius = m => (m >= 1000 ? m / 1000 + 'km' : m + 'm');

// ── 렌더링 ──
function renderTabs() {
  tabsEl.innerHTML = '';
  for (const c of CATS) {
    const btn = document.createElement('button');
    btn.className = 'tab';
    btn.setAttribute('aria-pressed', String(state.cat === c.id));
    btn.setAttribute('aria-label', `${c.label} 카테고리 선택`);
    btn.innerHTML = `<span aria-hidden="true">${c.emoji}</span>${c.label}`;
    btn.addEventListener('click', () => {
      state.cat = c.id;
      state.selectedId = null;
      renderAll();
    });
    tabsEl.appendChild(btn);
  }
}

// 칩은 카테고리가 바뀔 때만 다시 그린다 (제외 토글은 제자리에서 처리 → 팝 애니메이션 유지)
function renderChips() {
  chipsEl.innerHTML = '';
  for (const sub of SUBCATS[state.cat]) {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.dataset.sub = sub;
    btn.innerHTML = `${SUB_EMOJI[sub] ?? ''} ${sub}<svg class="icon" aria-hidden="true"><use href="#icon-x"/></svg>`;
    applyChipState(btn, sub);
    btn.addEventListener('click', () => onChipToggle(btn, sub));
    chipsEl.appendChild(btn);
  }
}

function applyChipState(btn, sub) {
  const excluded = state.excluded[state.cat].has(sub);
  btn.setAttribute('aria-pressed', String(excluded));
  btn.setAttribute('aria-label', `${sub} ${excluded ? '제외됨 — 눌러서 다시 포함' : '포함됨 — 눌러서 제외'}`);
}

// 제외 토글: 칩 팝 + (제외 시) 해당 카드들이 튕겨 나가는 이펙트
function onChipToggle(btn, sub) {
  const set = state.excluded[state.cat];
  const excluding = !set.has(sub);
  excluding ? set.add(sub) : set.delete(sub);
  state.selectedId = null;

  applyChipState(btn, sub);
  btn.classList.remove('chip--pop');
  void btn.offsetWidth;           // 리플로우로 애니메이션 재시작
  btn.classList.add('chip--pop');

  if (excluding) {
    ejectBySub(sub, () => renderResults({ enter: false }));
  } else {
    renderResults({ enter: true });
  }
}

// 제외된 종류의 카드·마커를 "펑" 튕겨 낸 뒤 콜백 실행
function ejectBySub(sub, done) {
  const sel = `[data-sub="${(window.CSS?.escape ?? (s => s))(sub)}"]`;
  const victims = [
    ...listEl.querySelectorAll('.card' + sel),
    ...document.querySelectorAll('#mockMap .marker' + sel),
  ];
  if (!victims.length) { done(); return; }
  victims.forEach(el => el.classList.add('ejecting'));
  setTimeout(done, 300);
}

const RENDER_CAP = 600;   // 리스트·마커는 가까운 순 이만큼만 그림(뽑기는 전체 대상)
let lastCount = null;
function renderResults({ enter = true } = {}) {
  const full = getCandidates(activeStores, state);
  const list = full.slice(0, RENDER_CAP);
  const capped = full.length > RENDER_CAP;

  // 후보 수 (숫자가 바뀌면 살짝 튀는 펄스) — 카카오 모드면 반경도 함께 표시
  const scopeBits = [];
  if (state.isKakao) scopeBits.push(`반경 ${fmtRadius(state.radius)}`);
  if (capped) scopeBits.push(`가까운 ${RENDER_CAP}곳 표시`);
  const scope = scopeBits.length ? ` <span class="count-scope">· ${scopeBits.join(' · ')}</span>` : '';
  countEl.innerHTML = `지금 후보 <strong>${full.length}곳</strong>${scope}`;
  if (lastCount !== null && lastCount !== full.length) {
    countEl.classList.remove('pulse');
    void countEl.offsetWidth;
    countEl.classList.add('pulse');
  }
  lastCount = full.length;

  // 매장 카드
  listEl.classList.toggle('enter', enter);
  listEl.innerHTML = '';
  emptyEl.hidden = full.length > 0;
  list.forEach((s, i) => {
    const li = document.createElement('li');
    if (enter) li.style.animationDelay = Math.min(i * 35, 350) + 'ms';
    const btn = document.createElement('button');
    btn.className = 'card' + (s.id === state.selectedId ? ' selected' : '');
    btn.dataset.id = s.id;
    btn.dataset.sub = s.sub;
    // 카카오 데이터는 평점이 없어(null) 별점을 숨긴다
    const ratingHtml = s.rating ? `<span><span class="star" aria-hidden="true">★</span> ${s.rating.toFixed(1)}</span>` : '';
    const ratingAria = s.rating ? `별점 ${s.rating}, ` : '';
    btn.setAttribute('aria-label', `${s.name}, ${s.sub}, ${ratingAria}${s.dist}미터, 지도에서 보기`);
    btn.innerHTML = `
      <span class="card-emoji" aria-hidden="true">${SUB_EMOJI[s.sub] ?? '🍽'}</span>
      <span class="card-body">
        <h3 class="card-name">${s.name}</h3>
        <p class="card-meta"><span class="badge">${s.sub}</span>${ratingHtml}<span>${s.dist}m</span></p>
        <p class="card-addr">${s.addr}</p>
    `;
    btn.addEventListener('click', () => selectStore(s.id));
    li.appendChild(btn);
    listEl.appendChild(li);
  });

  // 지도 마커
  map.render(list, state.selectedId);

  // 뽑기 버튼 (전체 후보 대상)
  spinBtn.disabled = full.length === 0;
  spinBtnText.textContent = full.length === 0
    ? '후보가 없어요'
    : `뽑기 시작 · 후보 ${full.length}곳`;
}

function renderAll() {
  renderTabs();
  renderChips();
  renderResults();
}

// ── 매장 선택: 카드 ↔ 마커 서로 강조 ──
function selectStore(id) {
  state.selectedId = (state.selectedId === id) ? null : id;
  map.focus(state.selectedId);
  for (const el of listEl.querySelectorAll('.card')) {
    const on = el.dataset.id === state.selectedId;
    el.classList.toggle('selected', on);
    if (on) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

// ── 토스트 알림 ──
let toastTimer;
export function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

// ── 로딩 표시 (카카오 재검색 중) ──
function setLoading(on, msg) {
  if (on) { countEl.textContent = msg || '불러오는 중… ⏳'; spinBtn.disabled = true; }
}

// ── 카카오: 현재 center·radius로 전 카테고리 재검색 후 다시 그림 ──
let parkingOn = false;
async function reloadStores() {
  if (!kakao || !state.center) return;
  setLoading(true, '주변 매장을 불러오는 중… ⏳');
  try {
    const lists = await Promise.all(CATS.map(c => kakao.searchStores(c.id, state.center, state.radius)));
    activeStores = lists.flat();
  } catch (e) {
    console.warn('[대얌이] 매장 재검색 실패', e);
    toast('매장을 불러오지 못했어요 😢');
  }
  state.selectedId = null;
  // 위치·반경이 바뀌면 켜져 있던 주차장 표시는 초기화
  if (parkingOn) { map.clearParking(); parkingOn = false; updateParkingBtn(); }
  renderAll();
}

// ── 동네·지역 검색 (검색창 제출) ──
async function doLocationSearch(e) {
  e?.preventDefault();
  const q = searchInput.value.trim();
  if (!q) return;
  if (!state.isKakao) {   // 목업 모드: 이름 필터로 동작
    state.query = q; state.selectedId = null; renderResults({ enter: true });
    return;
  }
  setLoading(true, `'${q}' 찾는 중… ⏳`);
  try {
    const loc = await kakao.geocodePlace(q);
    if (!loc) { renderResults(); toast(`'${q}' 위치를 못 찾았어요 😢`); return; }
    state.center = { lat: loc.lat, lng: loc.lng };
    map.setScope(state.center, state.radius);
    await reloadStores();
    toast(`📍 ${loc.name} 주변으로 이동했어요`);
  } catch (err) {
    console.warn('[대얌이] 지역 검색 실패', err);
    renderResults();
    toast('검색 중 오류가 났어요 😢');
  }
}

// ── 반경/이동수단 변경 ──
function updateScopeUI() {
  radiusSelect.value = String(state.radius);
  radiusLabel.textContent = `반경 ${fmtRadius(state.radius)}`;
  travelWalk.setAttribute('aria-pressed', String(state.travelMode === 'walk'));
  travelCar.setAttribute('aria-pressed', String(state.travelMode === 'car'));
}

async function setScope(radius, travel) {
  state.radius = radius;
  state.travelMode = travel;
  updateScopeUI();
  if (state.isKakao && state.center) {
    map.setScope(state.center, radius);
    await reloadStores();
  }
}

// ── 근처 주차장 토글 ──
function updateParkingBtn() {
  parkingBtn.setAttribute('aria-pressed', String(parkingOn));
  parkingBtn.classList.toggle('on', parkingOn);
  parkingBtn.textContent = parkingOn ? '🅿️ 주차장 끄기' : '🅿️ 근처 주차장';
}

async function toggleParking() {
  if (!state.isKakao || !state.center) { toast('실지도 모드에서만 주차장을 찾을 수 있어요'); return; }
  if (parkingOn) {
    map.clearParking(); parkingOn = false; updateParkingBtn();
    toast('주차장 표시를 껐어요');
    return;
  }
  parkingBtn.disabled = true;
  parkingBtn.textContent = '🅿️ 찾는 중…';
  try {
    const list = await kakao.searchParking(state.center, state.radius);
    if (list.length) {
      map.renderParking(list);
      parkingOn = true;
      toast(`🅿️ 근처 주차장 ${list.length}곳을 지도에 표시했어요`);
    } else {
      toast('이 반경엔 주차장이 없어요 😢');
    }
  } catch (e) {
    console.warn('[대얌이] 주차장 검색 실패', e);
    toast('주차장 검색 중 오류가 났어요 😢');
  }
  parkingBtn.disabled = false;
  updateParkingBtn();
}

// ── 이벤트 연결 ──
let searchTimer;
searchInput.addEventListener('input', () => {
  if (state.isKakao) return;   // 카카오 모드에선 제출(Enter/버튼)로 지역 검색
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = searchInput.value;
    state.selectedId = null;
    renderResults({ enter: false });
  }, 150);
});
searchForm.addEventListener('submit', doLocationSearch);

sortSelect.addEventListener('change', () => {
  state.sort = sortSelect.value;
  renderResults();
});

locateBtn.addEventListener('click', async () => {
  if (state.isKakao) {
    setLoading(true, '내 위치로 이동 중… ⏳');
    state.center = await kakao.getPosition();
    map.setScope(state.center, state.radius);
    await reloadStores();
    toast('📍 내 위치 주변으로 이동했어요');
  } else {
    map.locate();
    toast('📍 목업 모드예요 — 내 위치는 지도 중앙에 고정돼 있어요');
  }
});

radiusSelect.addEventListener('change', () => setScope(+radiusSelect.value, null));
travelWalk.addEventListener('click', () => setScope(CONFIG.TRAVEL.walk, 'walk'));
travelCar.addEventListener('click', () => setScope(CONFIG.TRAVEL.car, 'car'));
parkingBtn.addEventListener('click', toggleParking);

// ── 당첨 결과를 홈 화면 배너에도 표시 ──
const winBanner = $('winBanner'), winName = $('winName'),
      winAddr = $('winAddr'), winMapLink = $('winMapLink');
function showWin(store) {
  winName.textContent = store.name;
  winAddr.textContent = store.addr || '';
  winMapLink.href = kakaoMapUrl(store);
  winBanner.hidden = false;
  winBanner.classList.remove('pop');
  void winBanner.offsetWidth;
  winBanner.classList.add('pop');
}
$('winClose').addEventListener('click', () => { winBanner.hidden = true; });

const roulette = createRoulette({ toast, onWin: showWin });
spinBtn.addEventListener('click', () => {
  roulette.open(getCandidates(activeStores, state));
});

// ── 반경 선택지 채우기 ──
function buildRadiusOptions() {
  radiusSelect.innerHTML = CONFIG.RADII
    .map(m => `<option value="${m}">${fmtRadius(m)}</option>`)
    .join('');
}

// ── 부트스트랩: 카카오 키가 있으면 실지도+실매장, 없으면 목업 ──
async function boot() {
  buildRadiusOptions();
  if (CONFIG.KAKAO_JS_KEY) {
    try {
      kakao = await import('./kakao.js');
      state.isKakao = true;
      state.center = await kakao.getPosition();
      map = await kakao.createKakaoMap($('mockMap'), { onMarkerClick: selectStore }, state.center, state.radius);
      const badge = document.querySelector('.map-badge');
      if (badge) badge.innerHTML =
        `<svg class="icon" style="width:15px;height:15px" aria-hidden="true"><use href="#icon-pin"/></svg> 카카오맵 · 내 주변 실시간`;
      scopeRow.hidden = false;
      parkingBtn.hidden = false;
      updateScopeUI();
      const lists = await Promise.all(CATS.map(c => kakao.searchStores(c.id, state.center, state.radius)));
      activeStores = lists.flat();
    } catch (e) {
      console.warn('[대얌이] 카카오 연동 실패 — 목업으로 폴백합니다.', e);
      state.isKakao = false;
      kakao = null;
    }
  }
  if (!map) map = createMapController($('mockMap'), { onMarkerClick: selectStore });
  renderAll();
}
boot();
