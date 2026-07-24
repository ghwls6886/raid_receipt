# raid_receipt

`mes_nestjs`를 참고하여 구성한 모노레포 스캐폴드입니다. (Turborepo + pnpm)

## 구조

```
raid_receipt/
├── apps/
│   ├── api/   # NestJS 11 백엔드 (기본 구성 + 공통 모듈)
│   └── web/   # React 19 + Vite 프론트엔드 (기본 화면 + 공통 위젯)
├── turbo.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

### 백엔드 (apps/api) — 가져온 공통 모듈

- `common/filters` — AllExceptionFilter (일관된 에러 응답)
- `common/interceptors` — LoggingInterceptor (요청/응답 로깅 + requestId)
- `common/utils` — validation(한글 검증 메시지), sanitize(민감정보 마스킹), kst-date
- `common/dto` — BatchDto, BulkDeleteDto
- `common/types` — ApiErrorResponse
- `infra/logger` — Winston 로거 (콘솔/파일 로테이션)
- `infra/health` — Health check
- `config` — env 부트스트랩, Swagger
- `modules/receipt` — 샘플 도메인 모듈 (인메모리)

> 인증(Keycloak)·DB(Prisma)는 스코프에서 제외했습니다. 필요 시 mes_nestjs의 `infra/auth`, `prisma`를 이식하세요.

### 프론트엔드 (apps/web) — 가져온 공통 위젯

- `components/feedback` — Toast, ConfirmDialog, ErrorDialog, ErrorBoundary, LoadingState, GlobalLoadingOverlay
- `components/popup` — Modal (드래그/리사이즈)
- `components/layout` — Header, Sidebar, Layout
- `stores` — theme(라이트/다크), toast, confirm, errorDialog (Zustand)
- `lib` — axios(공통 인스턴스+에러 인터셉터), cn, utils
- `styles` — 디자인 토큰(steel-blue 테마) + Tailwind v4 연동

> 원본의 Syncfusion/Sentry/Keycloak 결합은 제거하고 lucide-react + 순수 React로 대체했습니다.

## 개발 명령어

```bash
pnpm install

pnpm dev                 # api + web 동시 실행
pnpm dev --filter=api    # 백엔드만 (http://localhost:3000, 문서 /api-docs)
pnpm dev --filter=web    # 프론트만 (http://localhost:5173, /api 는 백엔드로 프록시)

pnpm build               # 전체 빌드
pnpm typecheck           # 전체 타입체크
```
