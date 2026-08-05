import { Modal } from '@/components/popup/Modal';
import { Button } from '@/components/ui/Button';

interface SettlementRulesDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * 참여자별 정산 규칙 설명 — 매번 읽을 내용이 아니라 카드에 붙박이로 두면 화면만 길어진다.
 * 궁금할 때만 열어 보도록 팝업으로 뺐다.
 */
export function SettlementRulesDialog({ isOpen, onClose }: SettlementRulesDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="참여자별 정산 규칙"
      width={560}
      footer={
        <Button variant="secondary" onClick={onClose}>
          닫기
        </Button>
      }
    >
      <div className="text-text-secondary space-y-4 text-sm leading-relaxed">
        <section>
          <h3 className="text-text-primary mb-1 font-semibold">이탈 시점과 패널티는 별개입니다</h3>
          <p>
            <b className="text-text-primary">이탈 시점</b>은 누가 내 벌금을 받을 자격이 있는지,{' '}
            <b className="text-text-primary">패널티</b>는 얼마를 깎을지를 정합니다. 둘은 독립이라
            &quot;2페 이탈 + 지각&quot;처럼 여러 개를 같이 걸 수 있고 금액은 합산됩니다.
          </p>
        </section>

        <section>
          <h3 className="text-text-primary mb-1 font-semibold">걷힌 벌금은 누구에게 가나</h3>
          <p>
            <b className="text-text-primary">그 사람보다 오래 남은 참여자</b>에게만 재분배됩니다.
            2페 이탈자는 3페 이탈자의 벌금을 가져갈 수 없고, 같은 페이즈에서 이탈한 사람끼리도 서로
            가져갈 수 없습니다. 완주자의 벌금은 본인을 뺀 전원에게 나눠집니다.
          </p>
        </section>

        <section>
          <h3 className="text-text-primary mb-1 font-semibold">몰수</h3>
          <p>
            노쇼 100% 등으로 몫을 전부 뺏긴 경우입니다.{' '}
            <b className="text-text-primary">몰수 대상자는 남의 벌금도 받지 않습니다.</b>
          </p>
        </section>

        <section>
          <h3 className="text-text-primary mb-1 font-semibold">역할 지원금</h3>
          <p>
            n빵 <b className="text-text-primary">전</b>에 분배 대상액에서 먼저 떼어 지급하므로
            공대장 인센티브는 줄지 않고 공대원 전원이 1/N씩 부담합니다. 이탈해도 전액 지급되지만 몰수
            대상자에게는 지급되지 않습니다.
          </p>
        </section>
      </div>
    </Modal>
  );
}
