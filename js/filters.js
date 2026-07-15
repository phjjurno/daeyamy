// ══════════════════════════════════════════════════════════
// 카테고리 정의 + 필터 · 정렬 로직
// ══════════════════════════════════════════════════════════

// 상위 카테고리: 음식점 / 카페 / 술안주 (따로따로)
export const CATS = [
  { id: 'food', label: '음식점', emoji: '🍚' },
  { id: 'cafe', label: '카페',   emoji: '☕' },
  { id: 'pub',  label: '술안주', emoji: '🍺' },
];

// 카테고리별 하위 종류 — 칩에서 눌러서 "제외"
export const SUBCATS = {
  food: ['한식', '양식', '일식', '중식', '분식'],
  cafe: ['카페', '빵집', '디저트'],
  pub:  ['한식주점', '이자카야', '호프', '포차', '와인바'],
};

// 하위 종류별 대표 이모지 (카드·마커에 사용)
export const SUB_EMOJI = {
  한식: '🍚', 양식: '🍝', 일식: '🍣', 중식: '🥟', 분식: '🍢',
  카페: '☕', 빵집: '🥐', 디저트: '🍰',
  한식주점: '🍶', 이자카야: '🏮', 호프: '🍺', 포차: '🌃', 와인바: '🍷',
};

const SORTERS = {
  distance: (a, b) => a.dist - b.dist,
  rating:   (a, b) => b.rating - a.rating,
  name:     (a, b) => a.name.localeCompare(b.name, 'ko'),
};

// 현재 상태(카테고리·제외 목록·검색어·정렬)에 맞는 후보 매장 목록
export function getCandidates(stores, state) {
  const q = state.query.trim().toLowerCase();
  return stores
    .filter(s => s.cat === state.cat)
    .filter(s => !state.excluded[state.cat].has(s.sub))
    .filter(s => !q || [s.name, s.sub, s.addr].some(v => v.toLowerCase().includes(q)))
    .sort(SORTERS[state.sort] ?? SORTERS.distance);
}
