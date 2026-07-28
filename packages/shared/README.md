# @raid-receipt/shared

FE·Edge Function 공용 타입/상수용 패키지 (골격).

> 참고: DB 파생 타입은 **`supabase gen types typescript`** 로 자동 생성하는 게 정석이라,
> 대부분의 타입은 그쪽(`apps/web/src/lib/database.types.ts`)에서 옵니다.
> 이 패키지는 그 외 공용 상수/도메인 타입(예: `RemainderPolicy` 라벨, 정산 입력 타입)이
> 여러 곳에서 필요할 때만 채우세요. 지금은 비어 있습니다.

## 후보 이전 대상 (필요 시)

- `apps/web/src/lib/settlement.ts` — 정산 순수 함수(§3). Edge/RPC 에서도 쓰면 여기로.
- `RemainderPolicy` / `PenaltyCalcType` 등 enum 라벨 맵.
