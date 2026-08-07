/**
 * 버프콜 소리 — 비프음(Web Audio) + 음성 안내(Web Speech).
 *
 * 브라우저 자동재생 정책 때문에 **유저 제스처 없이는 소리가 나지 않는다.**
 * AudioContext 는 첫 클릭 때 resumeAudio() 로 깨워야 한다. 파티원이
 * "소리 켜기" 를 한 번 눌러야 하는 이유가 이것이다.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  audioCtx ??= new AudioContext();
  return audioCtx;
}

/** 짧은 비프음. volume 은 0~1. */
export function playBeep(volume = 1, frequency = 880, durationMs = 200): void {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.value = frequency;
    // 0.3 이 기준 크기. 그보다 키우면 뒤따르는 음성 안내를 덮는다.
    // exponentialRampToValueAtTime 은 0 을 받지 못하므로 하한을 둔다.
    gain.gain.value = Math.max(0.0001, 0.3 * volume);

    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
    osc.stop(ctx.currentTime + durationMs / 1000);
  } catch {
    // AudioContext 를 못 쓰는 환경 — 소리만 안 날 뿐 타이머는 계속 돈다.
  }
}

/** 음성 안내. rate 는 0.5~2.0, volume 은 0~1. */
export function speak(text: string, rate = 1.0, volume = 1): void {
  if (!('speechSynthesis' in window)) return;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ko-KR';
  utterance.rate = rate;
  utterance.volume = volume;

  // 이전 안내를 끊는다. 주기가 짧으면 큐가 밀려서 몇 사이클 전 콜이
  // 뒤늦게 나오는데, 그게 지금 콜을 놓치는 것보다 더 헷갈린다.
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

/** 유저 제스처 직후에 호출한다 — 그 전에는 suspended 로 막혀 있다. */
export function resumeAudio(): void {
  if (audioCtx?.state === 'suspended') void audioCtx.resume();
}
