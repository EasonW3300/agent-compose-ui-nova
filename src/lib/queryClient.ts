import { QueryClient } from '@tanstack/react-query';

/** 应用级单例：查询默认不重试、不随窗口聚焦刷新，stale 30s。 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});
