/**
 * 기간 경계 계산 — KST 고정 (MERGE_PLAN §7 2단계).
 *
 * 숙제 체크는 "언제의 숙제인가"를 period_date 하나로 판정한다
 * (checklist_completions 의 unique (template_id, character_id, period_date)).
 * 그 키를 만드는 곳이 여기다.
 *
 * **브라우저 타임존을 쓰지 않는다.** 게임 초기화가 KST 기준이라, 해외에 있거나
 * PC 시계가 다른 타임존이면 초기화 시점이 어긋나 어제 숙제가 오늘 것으로 보인다.
 *
 * lib/format.ts 와 역할이 다르다 — 저쪽은 화면 표시용 포맷터고, 여기는 저장 키다.
 */

/**
 * `<input type="datetime-local">` 이 요구하는 "YYYY-MM-DDTHH:mm".
 *
 * toISOString() 을 쓰면 안 된다 — UTC 로 바뀌어서 사용자가 보는 시각이 밀린다.
 * 여기는 기간 키와 달리 **로컬 타임존**이 맞다. 사용자가 자기 시계를 보고
 * 입장 시각을 보정하는 입력이기 때문이다.
 */
export function toDatetimeLocal(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

/** KST 기준 오늘 "YYYY-MM-DD" — 일간 숙제의 기간 키 */
export function getTodayKST(): string {
  // sv-SE 로케일이 ISO 형태(YYYY-MM-DD)를 그대로 준다
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
}

/** KST 기준 이번 주 월요일 "YYYY-MM-DD" — 주간 숙제의 기간 키 */
export function getWeekStartKST(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)!.value);

  // KST 날짜를 로컬 Date 로 재구성한다. 시각은 버리고 날짜 산술만 하므로
  // 로컬 타임존이 무엇이든 결과가 같다.
  const kstDate = new Date(get('year'), get('month') - 1, get('day'));
  const day = kstDate.getDay(); // 0=일요일
  const diffToMonday = day === 0 ? -6 : 1 - day;
  kstDate.setDate(kstDate.getDate() + diffToMonday);

  const y = kstDate.getFullYear();
  const m = String(kstDate.getMonth() + 1).padStart(2, '0');
  const d = String(kstDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
