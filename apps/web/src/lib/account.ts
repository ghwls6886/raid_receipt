/**
 * 길드 계정 권한 — auth 층 공용 타입 (MERGE_PLAN §3.1)
 *
 * guild_accounts 는 "어느 길드에 어떤 권한으로 속하는가"를 나타내는 층으로,
 * user_profiles(서비스 전역 프로필)·members(정산 대상 인물)와 구분된다.
 * stores 와 features 양쪽이 참조하므로 feature 가 아니라 lib 에 둔다.
 */

export type AccountRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export const ACCOUNT_ROLE_LABEL: Record<AccountRole, string> = {
  OWNER: '관리자',
  ADMIN: '부관리자',
  MEMBER: '멤버',
};

export interface GuildAccount {
  id: string;
  guildId: string;
  email: string;
  name: string;
  role: AccountRole;
}
