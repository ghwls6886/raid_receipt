/**
 * 버프 주기 타이머 — Web Worker.
 *
 * 메인 스레드에서 돌리지 않는 이유: 브라우저는 비활성 탭의 setInterval 을
 * 1초 이상으로 throttle 한다. 심콜이 2분 주기인데 탭을 옮겼다고 몇 초씩
 * 밀리면 쓸모가 없다. 워커의 타이머는 그 대상이 아니다.
 *
 * `@/` 별칭을 쓰지 않는다 — runner.ts 의 주석 참고.
 */
import type { WorkerInMessage, WorkerOutMessage } from './workerTypes';

interface TimerState {
  intervalMs: number;
  startedAt: number;
  cycleCount: number;
  tickId: ReturnType<typeof setInterval>;
}

/** 100ms 마다 확인한다 — 주기 경계를 놓치지 않을 만큼 촘촘하다 */
const TICK_MS = 100;

const timers = new Map<string, TimerState>();

function post(msg: WorkerOutMessage) {
  self.postMessage(msg);
}

function stopTimer(id: string) {
  const timer = timers.get(id);
  if (!timer) return;
  clearInterval(timer.tickId);
  timers.delete(id);
}

function startTimer(id: string, intervalMs: number, sharedStartedAt?: number) {
  stopTimer(id);

  // 파티가 공유하는 기준 시각이 있으면 그걸 쓴다. 전원의 사이클이 정렬된다.
  const startedAt = sharedStartedAt ?? Date.now();

  // 이미 지난 사이클은 울리지 않는다. 늦게 합류한 사람이 그동안의 알림을
  // 몰아서 받는 것을 막는다 — 카운터를 현재 사이클로 맞춰 놓고 시작한다.
  let cycleCount = Math.max(0, Math.floor((Date.now() - startedAt) / intervalMs));

  const tickId = setInterval(() => {
    const elapsed = Date.now() - startedAt;
    const currentCycle = Math.floor(elapsed / intervalMs);

    if (currentCycle > cycleCount) {
      cycleCount = currentCycle;
      post({ type: 'CYCLE_COMPLETE', id, cycleCount });
    }

    post({ type: 'TICK', id, elapsed: elapsed % intervalMs });
  }, TICK_MS);

  timers.set(id, { intervalMs, startedAt, cycleCount, tickId });
}

function stopAll() {
  for (const [id] of timers) stopTimer(id);
}

self.onmessage = (e: MessageEvent<WorkerInMessage>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'START_TIMER':
      startTimer(msg.id, msg.intervalMs, msg.startedAt);
      break;
    case 'STOP_TIMER':
      stopTimer(msg.id);
      break;
    case 'STOP_ALL':
      stopAll();
      break;
  }
};
