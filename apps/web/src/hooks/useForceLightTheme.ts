import { useEffect } from 'react';

/**
 * 이 화면이 떠 있는 동안 다크모드를 끄고 라이트로 고정한다. 언마운트 시 원상복구.
 *
 * 랜딩·허브는 마케팅 화면이라 앱 테마 설정과 무관하게 항상 같은 인상을 줘야 한다.
 * 배경 그라데이션과 글래스 카드가 라이트 전제로 잡혀 있어 다크에서 열면 대비가 깨진다.
 *
 * MutationObserver 를 쓰는 이유: `initTheme()` 이나 테마 스토어가 나중에 다시 `dark` 를
 * 붙일 수 있다. 한 번 지우는 것만으로는 경합에서 진다.
 *
 * 원래 LandingPage 안에 있던 로직인데 랜딩이 3개(정산·헬퍼·허브)로 늘면서 뽑아냈다.
 */
export function useForceLightTheme(): void {
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains('dark');
    const prevScheme = root.style.colorScheme;

    const forceLight = () => {
      if (root.classList.contains('dark')) root.classList.remove('dark');
      if (root.style.colorScheme !== 'light') root.style.colorScheme = 'light';
    };

    forceLight();
    const observer = new MutationObserver(forceLight);
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'style'] });

    return () => {
      observer.disconnect();
      if (hadDark) root.classList.add('dark');
      root.style.colorScheme = prevScheme;
    };
  }, []);
}
