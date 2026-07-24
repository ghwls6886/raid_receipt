import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/common/Logo';

/** 약관/개인정보 공용 셸 — 공개(비로그인) 페이지 */
function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="bg-bg-page min-h-screen">
      <header className="border-border-subtle border-b">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4 sm:px-6">
          <button
            aria-label="뒤로"
            className="text-text-secondary hover:bg-bg-hover rounded-md p-2"
            onClick={() => navigate(-1)}
            type="button"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="h-7 w-7 text-[28px]">
            <Logo />
          </div>
          <span className="text-text-primary font-bold">{title}</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-6">
        {children}
        <p className="text-text-tertiary mt-10 text-xs leading-relaxed">
          본 문서는 초안이며, 정식 서비스 개시 전 법률 자문을 거쳐 확정됩니다. 시행일: 2026-07-24.
        </p>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="text-text-primary text-lg font-bold">{title}</h2>
      <div className="text-text-secondary mt-2 space-y-2 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

/** 이용약관 (명세서 §10) */
export function TermsPage() {
  return (
    <LegalShell title="이용약관">
      <Section title="1. 서비스 개요">
        <p>
          '메월드 길드 정산 매니저'(이하 '서비스')는 메이플월드 길드의 보스 레이드 정산을 돕는{' '}
          <b>서드파티 보조 도구</b>입니다. 서비스는 게임 운영사와 제휴·보증 관계가 없는 비공식
          도구입니다.
        </p>
      </Section>
      <Section title="2. 상표 및 지식재산">
        <p>
          '메이플스토리', '메이플랜드', '메이플플래닛' 등 게임·서비스 명칭과 상표는 각 권리자에게
          귀속됩니다. 서비스는 해당 상표를 직접 사용하지 않으며, 계산 편의를 제공하는 서드파티
          도구임을 명시합니다.
        </p>
      </Section>
      <Section title="3. 면책">
        <p>
          정산 계산 결과는 <b>참고용 보조 자료</b>이며, 최종 금액 확인·분배 책임은 이용자(길드)에게
          있습니다. 서비스의 명백한 오류로 손해가 발생한 경우, 배상 범위는 해당 건에 차감된{' '}
          <b>크레딧 1회 복구</b>로 제한됩니다.
        </p>
      </Section>
      <Section title="4. 크레딧 및 환불">
        <p>크레딧은 레이드 '확정' 시 1건당 1개 차감되며, 임시저장은 차감되지 않습니다.</p>
        <p>
          미사용 크레딧은 결제일로부터 <b>7일 이내 100% 환불</b>됩니다. 발송 실패 등 서비스 사유로
          차감된 크레딧은 자동 복구됩니다.
        </p>
      </Section>
      <Section title="5. 금지 행위">
        <p>
          무료 크레딧 어뷰징(계정·길드 양산), 서비스 정상 운영 방해, 타인 정보의 무단 등록 등을
          금합니다. 위반 시 이용이 제한될 수 있습니다.
        </p>
      </Section>
      <Section title="6. 문의">
        <p>서비스 관련 문의: support@example.com</p>
      </Section>
    </LegalShell>
  );
}

/** 개인정보처리방침 (명세서 §10, PIPA) */
export function PrivacyPage() {
  return (
    <LegalShell title="개인정보처리방침">
      <Section title="1. 수집하는 개인정보 항목">
        <ul className="list-disc space-y-1 pl-5">
          <li>구글 계정 정보(이메일) — 로그인·식별</li>
          <li>디스코드 웹훅 URL — 정산 영수증 발송</li>
          <li>인게임 닉네임 — 길드원 관리·정산 표기</li>
        </ul>
      </Section>
      <Section title="2. 수집 및 이용 목적">
        <p>회원 식별 및 로그인, 정산 영수증의 디스코드 발송, 길드원·정산 데이터 관리를 위해 이용합니다.</p>
      </Section>
      <Section title="3. 보관 및 파기">
        <p>
          수집한 개인정보는 이용 목적 달성 또는 회원 탈퇴 시 지체 없이 파기합니다. 관계 법령에 따라
          보관이 필요한 경우 해당 기간 동안 분리 보관합니다.
        </p>
      </Section>
      <Section title="4. 제3자 제공">
        <p>
          원칙적으로 개인정보를 제3자에게 제공하지 않습니다. 디스코드 발송은 이용자가 직접 등록한
          웹훅 채널로만 전송됩니다.
        </p>
      </Section>
      <Section title="5. 이용자 권리">
        <p>
          이용자는 자신의 개인정보에 대해 열람·정정·삭제·처리정지를 요구할 수 있으며, 서비스는 관련
          법령(개인정보보호법)에 따라 지체 없이 조치합니다.
        </p>
      </Section>
      <Section title="6. 개인정보 보호책임자">
        <p>문의: privacy@example.com</p>
      </Section>
    </LegalShell>
  );
}
