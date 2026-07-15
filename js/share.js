// ══════════════════════════════════════════════════════════
// 공유 모듈 — 카카오맵 링크 + Web Share API (폴백: 클립보드 복사)
// ══════════════════════════════════════════════════════════
export const SITE_NAME = '대얌이';

// 카카오맵 딥링크 — 장소 상세 URL > 좌표 링크 > 이름 검색 순 (API 키 불필요)
export function kakaoMapUrl(store) {
  if (store.url) return store.url;                    // 카카오 장소 상세 페이지 (실매장)
  if (store.lat && store.lng)                          // 좌표가 있으면 지도 핀
    return `https://map.kakao.com/link/map/${encodeURIComponent(store.name)},${store.lat},${store.lng}`;
  return 'https://map.kakao.com/link/search/' + encodeURIComponent(store.name);
}

// 친구에게 보낼 공유 문구 (사이트 홍보 문구 포함)
export function buildShareText(store) {
  const siteUrl = location.origin; // 배포 후 실제 도메인으로 표시됨
  const rating = store.rating ? ` · ⭐${store.rating}` : '';  // 카카오 데이터는 평점 없음 → 생략
  return `🎡 오늘 뭐 먹을지 고민될 땐 ${SITE_NAME}!\n` +
    `오늘의 추천 👉 ${store.name} (${store.sub}${rating})\n` +
    `📍 ${store.addr}\n` +
    `지도 보기: ${kakaoMapUrl(store)}\n\n` +
    `너도 ${SITE_NAME}에서 룰렛 돌려봐 → ${siteUrl}`;
}

// 공유 실행: Web Share API → 클립보드 순으로 시도
// 반환: 'shared' | 'copied' | 'cancel' | 'failed'
export async function shareStore(store) {
  const text = buildShareText(store);
  if (navigator.share) {
    try {
      await navigator.share({ title: `${SITE_NAME} — 오늘의 추천`, text });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancel';
      // 공유 시트 실패 시 클립보드로 폴백
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch (e) {
    return 'failed';
  }
}
