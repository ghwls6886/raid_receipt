/**
 * 버프 타이머 Worker 메시지 프로토콜.
 *
 * 워커와 메인 스레드가 이 파일 하나만 공유한다. 워커 그래프 안에서는
 * `@/` 별칭을 쓰지 않는다 (runner.ts 의 주석 참고).
 */

// 메인 → 워커
export type WorkerInMessage =
  | {
      type: 'START_TIMER';
      id: string;
      intervalMs: number;
      /**
       * 주기의 기준 시각 (**epoch ms 정수**, ISO 문자열이 아니다).
       * 파티원 전원이 같은 값을 넣으면 사이클이 정렬돼 동시에 울린다.
       * 없으면 각자 시작한 시점이 기준이 된다.
       */
      startedAt?: number;
    }
  | { type: 'STOP_TIMER'; id: string }
  | { type: 'STOP_ALL' };

// 워커 → 메인
export type WorkerOutMessage =
  | { type: 'TICK'; id: string; elapsed: number }
  | { type: 'CYCLE_COMPLETE'; id: string; cycleCount: number };
