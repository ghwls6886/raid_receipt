/**
 * 구인 글 카테고리 (MERGE_PLAN §7 4단계).
 *
 * DB 는 `recruit_posts.category` 를 자유 text 로 둔다 — 게임 콘텐츠가 늘 때마다
 * enum 마이그레이션을 돌리고 싶지 않아서다. 화면 목록은 여기서만 관리한다.
 * 그래서 목록에 없는 값이 들어와도 조회는 깨지지 않고 id 가 그대로 보인다.
 */
export interface RecruitCategory {
  id: string;
  label: string;
}

/** 필터 전용 값. 구인 글에는 저장되지 않는다 */
export const CATEGORY_ALL = 'all';

/** 사이드바가 그대로 순회한다 — 'all' 이 목록의 일부다 */
export const RECRUIT_CATEGORIES: RecruitCategory[] = [
  { id: CATEGORY_ALL, label: '전체' },
  { id: 'hunt_10_30', label: '사냥 10~30' },
  { id: 'hunt_31_60', label: '사냥 31~60' },
  { id: 'hunt_61_100', label: '사냥 61~100' },
  { id: 'hunt_101_130', label: '사냥 101~130' },
  { id: 'hunt_131_170', label: '사냥 131~170' },
  { id: 'hunt_171_200', label: '사냥 171~200' },
  { id: 'party_quest', label: '파티퀘스트' },
  { id: 'boss_expedition', label: '보스 원정대' },
];

/** 작성 폼용 — 'all' 은 필터 값이라 글에 저장될 수 없다 */
export const CREATABLE_CATEGORIES = RECRUIT_CATEGORIES.filter((c) => c.id !== CATEGORY_ALL);

/** 목록에 없는 값이면 id 를 그대로 보여준다 — 빈칸보다는 낫다 */
export function categoryLabel(id: string): string {
  return RECRUIT_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}
