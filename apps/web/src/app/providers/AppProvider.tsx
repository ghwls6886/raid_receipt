import { type ReactNode, useState } from 'react';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from '@/stores/useToastStore';
import { ToastContainer } from '@/components/feedback/Toast';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { ErrorDialog } from '@/components/feedback/ErrorDialog';

/**
 * 전역 프로바이더 — React Query + 전역 피드백 위젯(Toast/Confirm/Error)
 */
export function AppProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: () => toast.error('데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'),
        }),
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ToastContainer />
      <ConfirmDialog />
      <ErrorDialog />
    </QueryClientProvider>
  );
}
