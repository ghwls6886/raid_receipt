import { useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  LayoutDashboard,
  Users,
  Swords,
  ScrollText,
  Plus,
  Coins,
  Settings,
  Wrench,
  Lightbulb,
  Calculator,
  MapPin,
  Check,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import {
  QUICK_START_STEPS,
  RULE_SECTIONS,
  SCREEN_SECTIONS,
  type ManualExample,
  type QuickStartStep,
  type RuleSection,
  type ManualSection,
} from '@/lib/manual';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

const ICON_BY_ID: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  members: Users,
  parties: Swords,
  raids: ScrollText,
  'raid-new': Plus,
  credits: Coins,
  settings: Settings,
  admin: Wrench,
};

type TabId = 'start' | 'rules' | 'screens';

const TABS: Array<{ id: TabId; label: string; hint: string; Icon: LucideIcon }> = [
  { id: 'start', label: '시작하기', hint: '순서대로 한 사이클', Icon: BookOpen },
  { id: 'rules', label: '정산 규칙', hint: '숫자가 나오는 과정', Icon: Calculator },
  { id: 'screens', label: '화면별 안내', hint: '기능 레퍼런스', Icon: MapPin },
];

/** 사용 매뉴얼 — 튜토리얼 / 정산 규칙 / 화면 레퍼런스 (콘텐츠는 lib/manual.ts) */
export function ManualPage() {
  const [tab, setTab] = useState<TabId>('start');

  return (
    <div>
      <PageHeader
        title="사용 매뉴얼"
        description="처음이라면 [시작하기]를 순서대로 따라 하세요. 한 사이클이면 끝납니다."
      />

      {/* 상단 탭 */}
      <div className="border-border-subtle mb-6 flex flex-wrap gap-1 border-b">
        {TABS.map(({ id, label, hint, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-current={tab === id}
            className={cn(
              '-mb-px flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2.5 text-sm transition-colors',
              tab === id
                ? 'border-brand-600 text-brand-700 font-semibold'
                : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary border-transparent',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{label}</span>
            <span className="text-text-tertiary hidden text-xs font-normal sm:inline">· {hint}</span>
          </button>
        ))}
      </div>

      {tab === 'start' && <QuickStartPanel />}
      {tab === 'rules' && <RulesPanel />}
      {tab === 'screens' && <ScreensPanel />}
    </div>
  );
}

// ─── 시작하기 ────────────────────────────────────────────────

function QuickStartPanel() {
  const [idx, setIdx] = useState(0);
  const topRef = useRef<HTMLDivElement>(null);

  const step = QUICK_START_STEPS[idx];
  const last = QUICK_START_STEPS.length - 1;

  const go = (next: number) => {
    setIdx(next);
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (!step) return null;

  return (
    <div ref={topRef} className="scroll-mt-32">
      <StepNav current={idx} onSelect={go} />
      <StepBody step={step} />

      <div className="mt-4 flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={() => go(idx - 1)} disabled={idx === 0}>
          <ArrowLeft className="h-4 w-4" /> 이전
        </Button>
        {idx < last ? (
          <Button onClick={() => go(idx + 1)}>
            다음: {QUICK_START_STEPS[idx + 1]?.label} <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <span className="text-text-tertiary text-sm">마지막 단계입니다.</span>
        )}
      </div>
    </div>
  );
}

interface StepNavProps {
  current: number;
  onSelect: (idx: number) => void;
}

/** 번호 알약 — 지나온 단계는 체크, 현재 단계는 강조 */
function StepNav({ current, onSelect }: StepNavProps) {
  return (
    <ol className="mb-5 grid gap-2 sm:grid-cols-3">
      {QUICK_START_STEPS.map((s, i) => {
        const active = i === current;
        const passed = i < current;
        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onSelect(i)}
              aria-current={active}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
                active
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-border-subtle text-text-secondary hover:bg-bg-hover',
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  active
                    ? 'bg-brand-600 text-white'
                    : passed
                      ? 'bg-success-500/15 text-success-600'
                      : 'bg-bg-muted text-text-tertiary',
                )}
              >
                {passed ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="min-w-0 truncate text-sm font-medium">{s.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function StepBody({ step }: { step: QuickStartStep }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-section-title">{step.title}</h2>
      <p className="text-text-secondary mt-1.5 text-sm leading-relaxed">{step.goal}</p>

      <p className="bg-bg-muted text-text-secondary mt-3 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs">
        <MapPin className="text-brand-600 h-3.5 w-3.5 shrink-0" />
        {step.where}
      </p>

      <h3 className="text-text-primary mt-5 mb-2 text-sm font-semibold">이렇게 합니다</h3>
      <ol className="text-text-secondary space-y-2 text-sm">
        {step.actions.map((action, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="bg-bg-muted text-text-tertiary mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-semibold tabular-nums">
              {i + 1}
            </span>
            <span className="leading-relaxed">{action}</span>
          </li>
        ))}
      </ol>

      {step.examples?.map((ex) => <ExampleTable key={ex.caption} example={ex} />)}

      <div className="border-success-500/30 bg-success-500/5 mt-5 flex items-start gap-2 rounded-lg border p-3">
        <Check className="text-success-600 mt-0.5 h-4 w-4 shrink-0" />
        <p className="text-text-secondary text-sm leading-relaxed">
          <b className="text-text-primary">완료 확인</b> — {step.done}
        </p>
      </div>

      <TipList tips={step.tips} />

      {step.nextHint && (
        <p className="text-text-tertiary mt-4 text-xs leading-relaxed">{step.nextHint}</p>
      )}
    </Card>
  );
}

// ─── 정산 규칙 ───────────────────────────────────────────────

function RulesPanel() {
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <TocNav items={RULE_SECTIONS.map((s) => ({ id: s.id, title: s.title }))} />
      <div className="space-y-4">
        {RULE_SECTIONS.map((s) => (
          <RuleCard key={s.id} section={s} />
        ))}
      </div>
    </div>
  );
}

function RuleCard({ section }: { section: RuleSection }) {
  return (
    <Card id={section.id} className="scroll-mt-32 p-5">
      <h2 className="text-section-title mb-2">{section.title}</h2>
      <div className="text-text-secondary space-y-2 text-sm leading-relaxed">
        {section.body.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {section.examples?.map((ex) => <ExampleTable key={ex.caption} example={ex} />)}
    </Card>
  );
}

// ─── 화면별 안내 ─────────────────────────────────────────────

function ScreensPanel() {
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <TocNav items={SCREEN_SECTIONS.map((s) => ({ id: s.id, title: s.title }))} />
      <div className="space-y-4">
        {SCREEN_SECTIONS.map((s) => (
          <ScreenCard key={s.id} section={s} />
        ))}
      </div>
    </div>
  );
}

function ScreenCard({ section }: { section: ManualSection }) {
  const Icon = ICON_BY_ID[section.id] ?? BookOpen;
  return (
    <Card id={section.id} className="scroll-mt-32 p-5">
      <div className="mb-1 flex items-center gap-2">
        <span className="bg-brand-50 text-brand-600 flex h-8 w-8 items-center justify-center rounded-lg">
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="text-section-title">{section.title}</h2>
      </div>
      <p className="text-text-secondary mb-3 text-sm">{section.summary}</p>

      <ol className="text-text-secondary list-decimal space-y-1.5 pl-5 text-sm">
        {section.steps.map((step, i) => (
          <li key={i} className="leading-relaxed">
            {step}
          </li>
        ))}
      </ol>

      <TipList tips={section.tips} />
    </Card>
  );
}

// ─── 공용 조각 ───────────────────────────────────────────────

function TocNav({ items }: { items: Array<{ id: string; title: string }> }) {
  return (
    <nav className="hidden lg:block">
      <ul className="sticky top-32 space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="text-text-secondary hover:bg-bg-hover hover:text-text-primary block rounded-md px-3 py-1.5 text-sm leading-snug"
            >
              {item.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function TipList({ tips }: { tips?: string[] }) {
  if (!tips || tips.length === 0) return null;
  return (
    <div className="bg-bg-muted mt-4 space-y-1.5 rounded-md p-3">
      {tips.map((tip, i) => (
        <p key={i} className="text-text-secondary flex items-start gap-2 text-xs leading-relaxed">
          <Lightbulb className="text-warning-500 mt-0.5 h-3.5 w-3.5 shrink-0" />
          {tip}
        </p>
      ))}
    </div>
  );
}

/** 영수증처럼 읽히는 예시 표 — 마지막 열은 금액이라 우측 정렬 + tabular-nums */
function ExampleTable({ example }: { example: ManualExample }) {
  const lastCol = example.columns.length - 1;
  return (
    <figure className="border-border-subtle mt-4 overflow-hidden rounded-lg border">
      <figcaption className="bg-bg-muted text-text-secondary border-border-subtle border-b px-3 py-2 text-xs font-medium">
        {example.caption}
      </figcaption>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border-subtle text-text-tertiary border-b text-xs">
              {example.columns.map((col, i) => (
                <th
                  key={i}
                  scope="col"
                  className={cn('px-3 py-2 font-medium', i === lastCol ? 'text-right' : 'text-left')}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {example.rows.map((row, r) => (
              <tr
                key={r}
                className={cn(
                  'border-border-subtle border-b last:border-0',
                  row.emphasis && 'bg-bg-muted/60',
                )}
              >
                {row.cells.map((cell, c) => (
                  <td
                    key={c}
                    className={cn(
                      'px-3 py-2',
                      c === lastCol ? 'text-right tabular-nums' : 'text-left',
                      row.emphasis ? 'text-text-primary font-semibold' : 'text-text-secondary',
                    )}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {example.note && (
        <p className="text-text-tertiary border-border-subtle border-t px-3 py-2 text-xs leading-relaxed">
          {example.note}
        </p>
      )}
    </figure>
  );
}
