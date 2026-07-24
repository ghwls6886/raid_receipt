/**
 * 로고 컴포넌트 — 부모 요소의 크기(w, h)를 따라감
 */
export function Logo() {
  return (
    <div className="from-brand-500 via-brand-600 to-accent-violet flex h-full w-full items-center justify-center rounded-lg bg-gradient-to-br shadow-sm">
      <span className="text-text-inverse font-bold" style={{ fontSize: '0.45em' }}>
        R
      </span>
    </div>
  );
}
