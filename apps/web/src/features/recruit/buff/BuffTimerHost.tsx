import { useEffect, useRef } from 'react';
import { useBuffCallStore } from '@/stores/useBuffCallStore';
import { subscribeBuffCycle } from './runner';
import { useAudioAlert, useNotification, useWakeLock } from './useAudioAlert';

/**
 * 버프콜 알림 상주 리스너 — 앱에 한 번만 마운트한다. 렌더하는 것은 없다.
 *
 * 파티방 컴포넌트가 이 일을 맡으면 화면을 옮기는 순간 소리가 끊긴다.
 * 워커는 계속 돌아도 사이클을 받아 재생할 쪽이 사라지기 때문이다.
 * 그래서 구독과 재생을 앱 껍데기로 올렸다.
 */
export function BuffTimerHost() {
  const skills = useBuffCallStore((s) => s.skills);
  const isRunning = useBuffCallStore((s) => s.isRunning);

  const { alert } = useAudioAlert();
  const { notify } = useNotification();
  const { request: requestWakeLock, release: releaseWakeLock } = useWakeLock();

  // 스킬이 바뀔 때마다 구독을 새로 걸면 그 순간의 사이클을 놓칠 수 있다.
  // 구독은 한 번만 걸고, 최신 값은 ref 로 들여다본다.
  const alertTextRef = useRef<Map<string, string>>(new Map());
  const isRunningRef = useRef(isRunning);

  useEffect(() => {
    const map = new Map<string, string>();
    for (const skill of skills) {
      if (skill.enabled) map.set(skill.id, skill.alertText);
    }
    alertTextRef.current = map;
  }, [skills]);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  // 워커 사이클 → 소리 + 알림
  useEffect(() => {
    return subscribeBuffCycle((skillId) => {
      if (!isRunningRef.current) return;

      // 꺼진 스킬은 지도에 없다. 워커에 남아 있던 타이머의 잔여 신호도 여기서 걸러진다.
      const text = alertTextRef.current.get(skillId);
      if (!text) return;

      alert(text);
      // notify 는 탭이 숨겨져 있을 때만 실제로 뜬다
      notify('심콜', { body: text, icon: '/favicon.ico' });
    });
  }, [alert, notify]);

  // 실행 중에는 화면이 꺼지지 않게 한다.
  // 브라우저가 문서를 숨기면 잠금을 자동 해제하므로 복귀 시 다시 건다.
  useEffect(() => {
    if (!isRunning) {
      void releaseWakeLock();
      return;
    }

    void requestWakeLock();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void requestWakeLock();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isRunning, requestWakeLock, releaseWakeLock]);

  return null;
}
