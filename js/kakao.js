// ══════════════════════════════════════════════════════════
// 카카오맵 연동 모듈 (PART 2)
//   - loadSdk()       : 카카오 지도 SDK 동적 로드 (services 라이브러리 포함)
//   - getPosition()   : 현재 위치 (거부 시 CONFIG.DEFAULT_CENTER 폴백)
//   - geocodePlace()  : 동네·지역 이름 → 좌표 (검색창용)
//   - createKakaoMap(): 실지도 컨트롤러 {render, focus, locate, setScope, renderParking, clearParking}
//   - searchStores()  : 내 주변 매장 전체 검색(페이지네이션) → 앱 store 형태로 변환
//   - searchParking() : 내 주변 주차장(PK6) 검색
//
// ⚠️ 이 파일은 CONFIG.KAKAO_JS_KEY 가 설정된 경우에만 로드·실행됩니다.
// ══════════════════════════════════════════════════════════
import { CONFIG } from './config.js';

// 카테고리 그룹 코드 (카카오 로컬): FD6=음식점, CE7=카페, PK6=주차장
const CAT_CODE = { food: 'FD6', cafe: 'CE7' };
// 술안주는 전용 코드가 없어 키워드로 검색
const PUB_KEYWORDS = ['술집', '호프', '이자카야', '포차', '와인바'];

// category_name(예: "음식점 > 한식 > 육류,고기") → 우리 하위 종류
const SUB_RULES = [
  [/분식/, '분식'], [/한식|국밥|찌개|백반|고기|육류/, '한식'],
  [/일식|초밥|스시|돈까스|텐동|라멘/, '일식'], [/중식|중국/, '중식'],
  [/양식|파스타|피자|스테이크|이탈리|프렌치/, '양식'],
  [/제과|베이커리|빵/, '빵집'], [/디저트|케이크|마카롱|도넛/, '디저트'], [/카페|커피/, '카페'],
  [/이자카야/, '이자카야'], [/포차|포장마차/, '포차'], [/와인/, '와인바'],
  [/호프|맥주|펍|비어/, '호프'], [/주점|술집|막걸리|전/, '한식주점'],
];
const CAT_DEFAULT_SUB = { food: '한식', cafe: '카페', pub: '한식주점' };

function subFrom(cat, categoryName = '') {
  for (const [re, sub] of SUB_RULES) if (re.test(categoryName)) return sub;
  return CAT_DEFAULT_SUB[cat];
}

// ── SDK 로더 (한 번만 로드) ──
let sdkPromise = null;
export function loadSdk() {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    if (!CONFIG.KAKAO_JS_KEY) { reject(new Error('KAKAO_JS_KEY 미설정')); return; }
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${CONFIG.KAKAO_JS_KEY}&libraries=services,clusterer&autoload=false`;
    s.onload = () => window.kakao.maps.load(resolve);
    s.onerror = () => reject(new Error('카카오 SDK 로드 실패 — 키·도메인 등록을 확인하세요'));
    document.head.appendChild(s);
  });
  return sdkPromise;
}

// ── 현재 위치 ──
export function getPosition() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(CONFIG.DEFAULT_CENTER);
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(CONFIG.DEFAULT_CENTER),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  });
}

// ── 페이지네이션: 한 영역의 모든 페이지(최대 45곳/쿼리)를 모아서 반환 ──
function searchAllPages(searchFn) {
  return new Promise(resolve => {
    const acc = [];
    const cb = (data, status, pagination) => {
      const kakao = window.kakao;
      if (status === kakao.maps.services.Status.OK) {
        acc.push(...data);
        if (pagination && pagination.hasNextPage) { pagination.nextPage(); return; }
      }
      resolve(acc);
    };
    searchFn(cb);
  });
}

// ── 동시 요청 수 제한 (카카오 레이트리밋·폭주 방지) ──
const MAX_CONCURRENT = 6;
let active = 0;
const waitQ = [];
function schedule(task) {
  return new Promise((resolve, reject) => {
    waitQ.push({ task, resolve, reject });
    pump();
  });
}
function pump() {
  while (active < MAX_CONCURRENT && waitQ.length) {
    const { task, resolve, reject } = waitQ.shift();
    active++;
    Promise.resolve().then(task).then(
      v => { active--; resolve(v); pump(); },
      e => { active--; reject(e); pump(); },
    );
  }
}

// ── 45곳 상한 우회: 반경을 격자로 나눠 훑고, 꽉 찬 칸은 4분할로 더 파고든다 ──
const R_EARTH = 6371000;
const GRID_DEPTH = 3;      // 기본 최대 분할 깊이 (칸이 45로 꽉 찰 때만 쪼갬)
const GRID_MAX_TILES = 80; // 카테고리당 요청 폭주 방지 상한

function haversine(a, b) {
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(s));
}

function boxAround(center, radius) {
  const dLat = radius / 111320;
  const dLng = radius / (111320 * Math.cos(center.lat * Math.PI / 180));
  return { minLat: center.lat - dLat, maxLat: center.lat + dLat, minLng: center.lng - dLng, maxLng: center.lng + dLng };
}

// makeQuery(cb, options) 로 한 사각형을 검색. 45로 꽉 차면 재귀 4분할.
async function collectGrid(makeQuery, center, radius, { depth: maxDepth = GRID_DEPTH, maxTiles = GRID_MAX_TILES } = {}) {
  const kakao = window.kakao;
  const seen = new Set();
  const out = [];
  let tiles = 0;

  async function recurse(box, depth) {
    if (tiles >= maxTiles) return;
    tiles++;
    const bounds = new kakao.maps.LatLngBounds(
      new kakao.maps.LatLng(box.minLat, box.minLng),
      new kakao.maps.LatLng(box.maxLat, box.maxLng),
    );
    const data = await schedule(() => searchAllPages(cb => makeQuery(cb, { bounds })));
    if (data.length >= 45 && depth < maxDepth && tiles < maxTiles) {
      const mLat = (box.minLat + box.maxLat) / 2, mLng = (box.minLng + box.maxLng) / 2;
      await Promise.all([
        { minLat: box.minLat, maxLat: mLat, minLng: box.minLng, maxLng: mLng },
        { minLat: box.minLat, maxLat: mLat, minLng: mLng, maxLng: box.maxLng },
        { minLat: mLat, maxLat: box.maxLat, minLng: box.minLng, maxLng: mLng },
        { minLat: mLat, maxLat: box.maxLat, minLng: mLng, maxLng: box.maxLng },
      ].map(q => recurse(q, depth + 1)));
    } else {
      for (const p of data) if (!seen.has(p.id)) { seen.add(p.id); out.push(p); }
    }
  }

  await recurse(boxAround(center, radius), 0);
  // 반경 안으로 필터 + 중심 거리 계산 + 가까운 순
  return out
    .map(p => ({ p, d: haversine(center, { lat: +p.y, lng: +p.x }) }))
    .filter(o => o.d <= radius)
    .sort((a, b) => a.d - b.d)
    .map(o => ({ ...o.p, _dist: Math.round(o.d) }));
}

// ── 동네·지역 이름 → 좌표 (검색창) ──
export async function geocodePlace(query) {
  await loadSdk();
  const kakao = window.kakao;
  const places = new kakao.maps.services.Places();
  const data = await searchAllPages(cb => places.keywordSearch(query, cb));
  if (!data.length) return null;
  const p = data[0];
  return { lat: +p.y, lng: +p.x, name: p.place_name };
}

// ── 현재 위치 마커(파란 점) / 주차장 마커(P) 이미지 ──
const ME_IMG = 'data:image/svg+xml;base64,' + btoa(
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="7" fill="#1A73E8" stroke="#fff" stroke-width="3"/></svg>');
const PARK_IMG = 'data:image/svg+xml;base64,' + btoa(
  '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="36"><rect x="3" y="2" width="24" height="24" rx="6" fill="#1A73E8" stroke="#fff" stroke-width="2"/><text x="15" y="20" font-size="15" font-family="Arial" font-weight="bold" fill="#fff" text-anchor="middle">P</text><path d="M15 34 L9 26 L21 26 Z" fill="#1A73E8"/></svg>');

// ── 실지도 컨트롤러 ──
export async function createKakaoMap(rootEl, { onMarkerClick }, center, radius = CONFIG.SEARCH_RADIUS) {
  await loadSdk();
  const kakao = window.kakao;
  rootEl.innerHTML = '';
  let centerLL = new kakao.maps.LatLng(center.lat, center.lng);
  const map = new kakao.maps.Map(rootEl, { center: centerLL, level: 5 });

  // 현재 위치 마커 + 반경 원
  const meImg = new kakao.maps.MarkerImage(ME_IMG, new kakao.maps.Size(24, 24), { offset: new kakao.maps.Point(12, 12) });
  const meMarker = new kakao.maps.Marker({ position: centerLL, map, image: meImg, zIndex: 6 });
  const circle = new kakao.maps.Circle({
    center: centerLL, radius, strokeWeight: 2, strokeColor: '#E61E4D',
    strokeOpacity: 0.85, strokeStyle: 'shortdash', fillColor: '#FF385C', fillOpacity: 0.06,
  });
  circle.setMap(map);

  const parkImg = new kakao.maps.MarkerImage(PARK_IMG, new kakao.maps.Size(30, 36), { offset: new kakao.maps.Point(15, 36) });
  let markers = new Map();
  let parkMarkers = [];
  // 매장 수천 개도 부드럽게 — 마커 클러스터링
  const clusterer = new kakao.maps.MarkerClusterer({ map, averageCenter: true, minLevel: 5, gridSize: 70 });

  const fitToCircle = () => map.setBounds(circle.getBounds());
  fitToCircle();

  return {
    isKakao: true,
    render(stores, selectedId = null) {
      clusterer.clear();
      markers = new Map();
      const arr = [];
      for (const s of stores) {
        const mk = new kakao.maps.Marker({ position: new kakao.maps.LatLng(s.lat, s.lng), title: s.name });
        kakao.maps.event.addListener(mk, 'click', () => onMarkerClick(s.id));
        markers.set(s.id, mk);
        arr.push(mk);
      }
      clusterer.addMarkers(arr);
    },
    focus(id) { const mk = markers.get(id); if (mk) map.panTo(mk.getPosition()); },
    locate() { map.panTo(centerLL); },
    // 검색 중심·반경 갱신 (내 위치 마커·원 이동 + 반경만큼 화면 맞춤)
    setScope(nextCenter, nextRadius) {
      centerLL = new kakao.maps.LatLng(nextCenter.lat, nextCenter.lng);
      meMarker.setPosition(centerLL);
      circle.setPosition(centerLL);
      circle.setRadius(nextRadius);
      fitToCircle();
    },
    renderParking(list) {
      this.clearParking();
      for (const p of list) {
        const mk = new kakao.maps.Marker({
          position: new kakao.maps.LatLng(p.lat, p.lng), map, image: parkImg, title: p.name, zIndex: 4,
        });
        kakao.maps.event.addListener(mk, 'click', () => window.open(p.url, '_blank', 'noopener'));
        parkMarkers.push(mk);
      }
    },
    clearParking() { parkMarkers.forEach(m => m.setMap(null)); parkMarkers = []; },
  };
}

// ── 매장 검색 → 앱 store 형태 (평점 없음 → rating null) ──
function toStore(p, cat) {
  return {
    id: p.id,
    name: p.place_name,
    cat,
    sub: subFrom(cat, p.category_name),
    rating: null,
    dist: p._dist != null ? p._dist : (p.distance ? +p.distance : 0),
    addr: p.road_address_name || p.address_name || '',
    lat: +p.y,
    lng: +p.x,
    url: p.place_url,
  };
}

// 반경 내 "전체" 매장 (격자 검색으로 45곳 상한 해제)
export async function searchStores(cat, center, radius = CONFIG.SEARCH_RADIUS) {
  await loadSdk();
  const kakao = window.kakao;
  const places = new kakao.maps.services.Places();

  let raw;
  if (cat === 'pub') {
    // 술안주: 키워드가 5개라 키워드당 격자는 얕게(depth 2) — 합치고 id 중복 제거 후 거리순
    const lists = await Promise.all(
      PUB_KEYWORDS.map(kw => collectGrid((cb, o) => places.keywordSearch(kw, cb, o), center, radius, { depth: 2, maxTiles: 22 }))
    );
    const seen = new Set();
    raw = [];
    for (const item of lists.flat()) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      raw.push(item);
    }
    raw.sort((a, b) => a._dist - b._dist);
  } else {
    raw = await collectGrid((cb, o) => places.categorySearch(CAT_CODE[cat], cb, o), center, radius);
  }

  return raw.map(p => toStore(p, cat));
}

// ── 주변 주차장(PK6) — 반경 내 전체 ──
export async function searchParking(center, radius = CONFIG.SEARCH_RADIUS) {
  await loadSdk();
  const kakao = window.kakao;
  const places = new kakao.maps.services.Places();
  const raw = await collectGrid((cb, o) => places.categorySearch('PK6', cb, o), center, radius);
  return raw.map(p => ({
    id: p.id,
    name: p.place_name,
    dist: p._dist,
    addr: p.road_address_name || p.address_name || '',
    lat: +p.y,
    lng: +p.x,
    url: p.place_url,
  }));
}
