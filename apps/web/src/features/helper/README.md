# features/helper — 개인 도구

maple_helper 에서 이식되는 **길드 불필요** 기능이 여기 들어온다. (MERGE_PLAN §7 2단계)

```
helper/
├── characters/     캐릭터 관리        (컴포넌트 4 + CharacterSelector)
├── checklist/      일일·주간 숙제      (컴포넌트 5)
├── boss-tracker/   개인 보스 추적      (컴포넌트 6, useBosses · useNow)
├── buff-call/      버프콜             (컴포넌트 8, useAudioAlert · useWakeLock)
└── api.ts          MH api-*.ts 를 RR 규약(타입 적용)으로 이식
```

지켜야 할 것:

- **`features/settlement` 을 직접 import 하지 않는다** (§4.1 원칙 3).
  공유가 필요하면 `@/lib` · `@/components` · `@/stores` 를 통한다.
- 보스·서버 마스터는 `@/lib/masters` 를 쓴다. 여기에 다시 만들지 않는다 (§3.2).
- 라우트는 `RequireAuth` 를 **`requireOnboarded` 없이** 감싼 그룹에 붙인다 (§4).
- 버프콜 워커(`workers/buff-timer.worker.ts`)는 `new URL('@/workers/...', import.meta.url)`
  형태라 Vite 별칭 정적 해석이 필요하다. 빠뜨리면 dev 는 되고 prod 빌드에서 죽는다 (§7 2단계).
