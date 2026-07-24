/**
 * 에러 다이얼로그 컴포넌트
 *
 * API 통신 에러 발생 시 사용자에게 알림을 표시. 앱은 정상 동작 상태이며,
 * 사용자는 확인 후 계속 작업할 수 있다. axios 인터셉터에서 자동 호출된다.
 */
import { Modal } from '@/components/popup/Modal';
import { useErrorDialogStore } from '@/stores/useErrorDialogStore';

export function ErrorDialog() {
  const { isOpen, title, message, closeError } = useErrorDialogStore();

  if (!isOpen) return null;

  const renderMessage = () => {
    if (Array.isArray(message)) {
      return (
        <ul className="list-inside list-disc space-y-1 text-left">
          {message.map((msg, index) => (
            <li key={index}>{msg}</li>
          ))}
        </ul>
      );
    }
    return <p>{message}</p>;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeError}
      title={title}
      width={400}
      footer={
        <button
          className="bg-brand-600 hover:bg-brand-700 rounded-md px-4 py-2 text-sm font-medium text-white"
          onClick={closeError}
          type="button"
        >
          확인
        </button>
      }
    >
      <div className="text-text-secondary text-sm">{renderMessage()}</div>
    </Modal>
  );
}
