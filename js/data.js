// ══════════════════════════════════════════════════════════
// 더미 매장 데이터 (PART 2에서 카카오 로컬 API 실데이터로 교체)
// x·y: 목업 지도 위 위치(%) — 내 위치(50,50) 기준으로 흩어 놓음
// dist: 내 위치로부터의 거리(m)
// ══════════════════════════════════════════════════════════
export const STORES = [
  // ── 음식점 · 한식 ──
  { id: 'f01', name: '뚝배기 끓는집',      cat: 'food', sub: '한식', rating: 4.6, dist: 180, addr: '서울 대얌구 오늘로3길 12',  x: 38, y: 36 },
  { id: 'f02', name: '시골밥상 온기',      cat: 'food', sub: '한식', rating: 4.3, dist: 420, addr: '서울 대얌구 뭐먹지길 8',    x: 66, y: 28 },
  { id: 'f03', name: '제육대장 본점',      cat: 'food', sub: '한식', rating: 4.8, dist: 640, addr: '서울 대얌구 룰렛대로 101', x: 22, y: 62 },
  // ── 음식점 · 양식 ──
  { id: 'f04', name: '파스타 부오노',      cat: 'food', sub: '양식', rating: 4.5, dist: 260, addr: '서울 대얌구 오늘로 45',     x: 58, y: 44 },
  { id: 'f05', name: '스테이크901',        cat: 'food', sub: '양식', rating: 4.2, dist: 750, addr: '서울 대얌구 대얌로 77',     x: 82, y: 58 },
  // ── 음식점 · 일식 ──
  { id: 'f06', name: '스시 유즈키',        cat: 'food', sub: '일식', rating: 4.7, dist: 330, addr: '서울 대얌구 룰렛대로 23',   x: 44, y: 58 },
  { id: 'f07', name: '텐동 하루',          cat: 'food', sub: '일식', rating: 4.4, dist: 510, addr: '서울 대얌구 오늘로12길 5',  x: 30, y: 22 },
  // ── 음식점 · 중식 ──
  { id: 'f08', name: '홍복반점',           cat: 'food', sub: '중식', rating: 4.1, dist: 290, addr: '서울 대얌구 뭐먹지길 31',   x: 54, y: 66 },
  { id: 'f09', name: '마라공방',           cat: 'food', sub: '중식', rating: 4.5, dist: 590, addr: '서울 대얌구 대얌로2길 14',  x: 74, y: 38 },
  // ── 음식점 · 분식 ──
  { id: 'f10', name: '대얌분식',           cat: 'food', sub: '분식', rating: 4.9, dist: 120, addr: '서울 대얌구 오늘로 7',      x: 46, y: 42 },
  { id: 'f11', name: '김밥천지 2호점',     cat: 'food', sub: '분식', rating: 4.0, dist: 380, addr: '서울 대얌구 룰렛대로 55',   x: 36, y: 74 },
  { id: 'f12', name: '떡볶이연구소',       cat: 'food', sub: '분식', rating: 4.6, dist: 470, addr: '서울 대얌구 뭐먹지길 19',   x: 63, y: 76 },

  // ── 카페 · 카페 ──
  { id: 'c01', name: '카페 몽글',          cat: 'cafe', sub: '카페', rating: 4.7, dist: 150, addr: '서울 대얌구 오늘로 15',     x: 52, y: 34 },
  { id: 'c02', name: '커피가 흐르는 오후', cat: 'cafe', sub: '카페', rating: 4.4, dist: 340, addr: '서울 대얌구 대얌로 33',     x: 70, y: 50 },
  { id: 'c03', name: '라떼 스탠드',        cat: 'cafe', sub: '카페', rating: 4.2, dist: 520, addr: '서울 대얌구 룰렛대로 88',   x: 26, y: 44 },
  { id: 'c04', name: '브루잉랩 723',       cat: 'cafe', sub: '카페', rating: 4.8, dist: 680, addr: '서울 대얌구 오늘로21길 2',  x: 18, y: 28 },
  // ── 카페 · 빵집 ──
  { id: 'c05', name: '뜨끈베이커리',       cat: 'cafe', sub: '빵집', rating: 4.6, dist: 230, addr: '서울 대얌구 뭐먹지길 3',    x: 42, y: 52 },
  { id: 'c06', name: '크로플하우스',       cat: 'cafe', sub: '빵집', rating: 4.3, dist: 450, addr: '서울 대얌구 대얌로5길 21',  x: 78, y: 26 },
  { id: 'c07', name: '소금빵장인',         cat: 'cafe', sub: '빵집', rating: 4.9, dist: 610, addr: '서울 대얌구 룰렛대로 120',  x: 14, y: 70 },
  // ── 카페 · 디저트 ──
  { id: 'c08', name: '티라미수클럽',       cat: 'cafe', sub: '디저트', rating: 4.5, dist: 310, addr: '서울 대얌구 오늘로 52',   x: 60, y: 20 },
  { id: 'c09', name: '마카롱데이',         cat: 'cafe', sub: '디저트', rating: 4.1, dist: 560, addr: '서울 대얌구 뭐먹지길 44', x: 48, y: 82 },

  // ── 술안주 ──
  { id: 'p01', name: '전집 비오는날',      cat: 'pub', sub: '한식주점', rating: 4.7, dist: 270, addr: '서울 대얌구 대얌로 9',     x: 34, y: 48 },
  { id: 'p02', name: '막걸리샘터',         cat: 'pub', sub: '한식주점', rating: 4.4, dist: 490, addr: '서울 대얌구 룰렛대로 67',  x: 68, y: 64 },
  { id: 'p03', name: '이자카야 코코로',    cat: 'pub', sub: '이자카야', rating: 4.6, dist: 350, addr: '서울 대얌구 오늘로8길 11', x: 56, y: 54 },
  { id: 'p04', name: '사케동네',           cat: 'pub', sub: '이자카야', rating: 4.2, dist: 720, addr: '서울 대얌구 뭐먹지길 60',  x: 86, y: 34 },
  { id: 'p05', name: '호프의 정석',        cat: 'pub', sub: '호프',     rating: 4.3, dist: 200, addr: '서울 대얌구 오늘로 28',    x: 40, y: 30 },
  { id: 'p06', name: '크래프트탭 24',      cat: 'pub', sub: '호프',     rating: 4.8, dist: 540, addr: '서울 대얌구 대얌로3길 6',  x: 24, y: 80 },
  { id: 'p07', name: '포차 골목대장',      cat: 'pub', sub: '포차',     rating: 4.5, dist: 410, addr: '서울 대얌구 룰렛대로 42',  x: 72, y: 72 },
  { id: 'p08', name: '야간포차 별빛',      cat: 'pub', sub: '포차',     rating: 4.0, dist: 660, addr: '서울 대얌구 뭐먹지길 77',  x: 88, y: 66 },
  { id: 'p09', name: '와인바 무드',        cat: 'pub', sub: '와인바',   rating: 4.6, dist: 580, addr: '서울 대얌구 오늘로17길 9', x: 16, y: 50 },
];
