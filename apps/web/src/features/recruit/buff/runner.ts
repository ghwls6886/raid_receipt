/**
 * 버프 타이머 Worker 싱글톤.
 *
 * 워커를 컴포넌트가 소유하면 안 된다. 원본은 처음에 BuffTimerDisplay 의
 * useEffect 안에서 워커를 만들고 언마운트 때 terminate 했는데, 그러면 파티
 * 화면을 벗어나거나 모달을 닫는 순간 알림이 멈춘다. 모듈 수준으로 올려
 * 화면 전환과 무관하게 살아 있게 한다.
 *
 * **워커 경로는 상대 경로로 쓴다.** `new URL('@/...', import.meta.url)` 은
 * dev 서버에서는 통해도 프로덕션 빌드에서 별칭이 풀리지 않아 깨질 수 있다.
 * Vite 는 이 URL 을 정적 분석해 별도 청크로 뽑는데 그 단계는 경로 별칭을
 * 거치지 않는다. 워커를 같은 폴더에 두고 './' 로 가리켜 문제를 없앤다.
 */
import type { WorkerInMessage, WorkerOutMessage } from './workerTypes';

type CycleHandler = (skillId: string) => void;

let worker: Worker | null = null;
const handlers = new Set<CycleHandler>();

function getWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(new URL('./buff-timer.worker.ts', import.meta.url), {
    type: 'module',
  });

  worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
    const msg = e.data;
    if (msg.type !== 'CYCLE_COMPLETE') return;
    // 핸들러가 순회 중에 해제될 수 있으므로 복사본을 돈다.
    for (const handler of [...handlers]) handler(msg.id);
  };

  return worker;
}

/** 사이클 완료 알림을 구독한다. 반환된 함수로 해제. */
export function subscribeBuffCycle(handler: CycleHandler): () => void {
  handlers.add(handler);
  getWorker();
  return () => {
    handlers.delete(handler);
  };
}

export interface RunnableSkill {
  id: string;
  intervalSec: number;
}

/**
 * 기존 타이머를 모두 정리하고 주어진 스킬로 다시 시작한다.
 *
 * @param startedAt 파티가 공유하는 기준 시각(**epoch ms**). 넘기면 파티원
 *                  전원의 주기가 정렬돼 같은 순간에 울린다. 없으면 지금부터.
 */
export function startBuffTimers(skills: readonly RunnableSkill[], startedAt?: number): void {
  const w = getWorker();

  const stopAll: WorkerInMessage = { type: 'STOP_ALL' };
  w.postMessage(stopAll);

  for (const skill of skills) {
    const msg: WorkerInMessage = {
      type: 'START_TIMER',
      id: skill.id,
      intervalMs: skill.intervalSec * 1000,
      startedAt,
    };
    w.postMessage(msg);
  }
}

export function stopBuffTimers(): void {
  // 워커를 만든 적이 없으면 멈출 것도 없다 — 여기서 만들면 낭비다.
  if (!worker) return;
  const msg: WorkerInMessage = { type: 'STOP_ALL' };
  worker.postMessage(msg);
}
