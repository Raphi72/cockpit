import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useCreateStore } from '@/app/create-store';
import { useCreatePage } from '../hooks';

/**
 * « Nouvelle page » depuis le menu « Nouveau » ou la palette : pas de fenêtre, une page vierge est créée
 * et s'ouvre aussitôt (rattachée à la fiche ouverte, projet ou matière).
 */
export function CreatePageOnDemand() {
  const request = useCreateStore((state) => (state.open?.kind === 'page' ? state.open : null));
  const close = useCreateStore((state) => state.close);
  const create = useCreatePage();
  const navigate = useNavigate();

  useEffect(() => {
    if (!request) return;
    close();
    const { projectId, subjectId } = request.defaults;
    const entity = projectId ? { entityType: 'project' as const, entityId: projectId } : subjectId ? { entityType: 'subject' as const, entityId: subjectId } : {};
    void create.mutateAsync({ ...entity }).then((id) => navigate({ to: '/pages/$pageId', params: { pageId: id } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  return null;
}
