import { invoke } from '@tauri-apps/api/core';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/query-keys';
import type { AppInfo } from './model';

export function useAppInfo() {
  return useQuery({
    queryKey: queryKeys.appInfo,
    queryFn: () => invoke<AppInfo>('app_info'),
  });
}
