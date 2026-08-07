/**
 * 직업 분류 — 정산과 helper 가 공유한다 (MERGE_PLAN §4.1 원칙 1).
 *
 * 원래 features/settlement/api/members.ts 에 있었는데, maple_helper 의
 * lib/constants.ts JOB_CATEGORIES 와 **다섯 계열이 정확히 같았다**.
 * 캐릭터 등록 폼(helper)과 공대원 등록 폼(정산)이 같은 목록을 써야 하므로
 * feature 밖으로 올린다. helper 가 settlement 을 import 하면 안 된다.
 *
 * 정산 전용인 groupMembersByJob 은 Member[] 를 받으므로 members.ts 에 남는다.
 */

export const JOB_CATEGORIES = ['전사', '마법사', '궁수', '도적', '해적'] as const;

export type JobCategory = (typeof JOB_CATEGORIES)[number];

export interface JobGroup {
  category: JobCategory;
  jobs: string[];
}

export const JOB_GROUPS: JobGroup[] = [
  { category: '전사', jobs: ['히어로', '팔라딘', '다크나이트'] },
  { category: '마법사', jobs: ['아크메이지(불,독)', '아크메이지(썬,콜)', '비숍'] },
  { category: '궁수', jobs: ['보우마스터', '신궁'] },
  { category: '도적', jobs: ['나이트로드', '섀도어'] },
  { category: '해적', jobs: ['바이퍼', '캡틴'] },
];

/** 직업명으로 계열을 찾는다. 목록에 없으면 '기타' */
export function jobCategoryOf(job: string): string {
  return JOB_GROUPS.find((g) => g.jobs.includes(job))?.category ?? '기타';
}
