import { useCallback, useRef, useState } from 'react';
import { useBuffCallStore } from '@/stores/useBuffCallStore';
import { playBeep, resumeAudio, speak } from './audio';

/**
 * 버프콜 알림 재생.
 *
 * 볼륨·속도는 스토어에서 읽는다. 원본은 AudioSettingsModal 안에서만
 * 로컬 상태로 들고 있어서, 슬라이더를 움직여도 실제 소리에는 반영되지 않았다.
 */
export function useAudioAlert() {
  const volume = useBuffCallStore((s) => s.volume);
  const rate = useBuffCallStore((s) => s.rate);

  const initialized = useRef(false);

  /** 유저 제스처 안에서 한 번 호출해 오디오를 깨운다. */
  const init = useCallback(() => {
    if (initialized.current) return;
    resumeAudio();
    initialized.current = true;
  }, []);

  const alert = useCallback(
    (text: string) => {
      // 비프로 주의를 끌고, 곧바로 음성이 무슨 버프인지 말한다.
      playBeep(volume);
      speak(text, rate, volume);
    },
    [volume, rate],
  );

  return { init, alert };
}

/**
 * 데스크톱 알림.
 *
 * 탭이 보이는 동안에는 띄우지 않는다 — 화면에 카드가 이미 있는데
 * 시스템 알림까지 뜨면 중복이다.
 */
export function useNotification() {
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    typeof Notification === 'undefined' ? 'denied' : Notification.permission,
  );

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return 'denied' as const;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  const notify = useCallback(
    (title: string, options?: NotificationOptions) => {
      if (permission !== 'granted') return;
      if (document.visibilityState === 'visible') return;
      new Notification(title, options);
    },
    [permission],
  );

  return { permission, requestPermission, notify };
}

/**
 * 실행 중 화면이 꺼지지 않게 한다.
 *
 * 브라우저는 문서가 안 보이면 Wake Lock 을 자동 해제한다. 복귀 시 다시
 * 거는 것은 호출부(BuffTimerHost)가 visibilitychange 로 맡는다.
 */
export function useWakeLock() {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  const request = useCallback(async () => {
    if (!('wakeLock' in navigator)) return;
    // 이미 살아 있는 잠금이 있으면 또 요청하지 않는다.
    if (sentinelRef.current && !sentinelRef.current.released) return;
    try {
      sentinelRef.current = await navigator.wakeLock.request('screen');
    } catch {
      // 배터리 부족 등으로 거부될 수 있다 — 타이머 자체는 계속 돈다.
      sentinelRef.current = null;
    }
  }, []);

  const release = useCallback(async () => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    sentinelRef.current = null;
    try {
      await sentinel.release();
    } catch {
      // 이미 해제된 경우
    }
  }, []);

  return { request, release };
}
