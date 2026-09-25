import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/core/db';
import { queryKeys } from '@/core/query-keys';
import type { SettingDef } from './model';
import { getSetting, setSettingStatement } from './repository';

/** Valeur d'un réglage, ou sa valeur par défaut s'il n'a jamais été changé. */
export function useSetting<T>(setting: SettingDef<T>) {
  return useQuery({
    queryKey: queryKeys.settings(setting.key),
    queryFn: async () => (await getSetting<T>(db, setting.key)) ?? setting.fallback,
  });
}

/** Modifie un réglage : l'interface suit tout de suite, la base juste après. */
export function useSaveSetting<T>(setting: SettingDef<T>) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.settings(setting.key);
  return useMutation({
    mutationFn: (value: T) => db.batch([setSettingStatement(setting.key, value)]),
    onMutate: (value) => queryClient.setQueryData(queryKey, value),
    onSettled: () => void queryClient.invalidateQueries({ queryKey }),
  });
}
