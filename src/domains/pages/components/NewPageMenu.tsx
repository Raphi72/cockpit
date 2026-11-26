import { useNavigate } from '@tanstack/react-router';
import { FilePlus, FileText, Plus } from 'lucide-react';
import { db } from '@/core/db';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/ui/overlays/Menu';
import { Button } from '@/ui/primitives/Button';
import { useCreatePage, usePages } from '../hooks';
import { pageTitle, parseDoc, type EntityType } from '../model';
import { getPage } from '../repository';

type NewPageMenuProps = {
  label?: string;
  variant?: 'secondary' | 'ghost';
  parentId?: string | null;
  entityType?: EntityType | null;
  entityId?: string | null;
};

/** « Nouvelle page » : vierge, ou d'après un modèle ; elle s'ouvre aussitôt. */
export function NewPageMenu({ label = 'Nouvelle page', variant = 'secondary', parentId = null, entityType = null, entityId = null }: NewPageMenuProps) {
  const navigate = useNavigate();
  const create = useCreatePage();
  const { data: pages = [] } = usePages();
  const templates = pages.filter((p) => p.isTemplate);

  const open = async (templateId?: string) => {
    const template = templateId ? await getPage(db, templateId) : undefined;
    const id = await create.mutateAsync({
      parentId,
      entityType,
      entityId,
      doc: template ? parseDoc(template.content) : undefined,
    });
    void navigate({ to: '/pages/$pageId', params: { pageId: id } });
  };

  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant={variant} icon={Plus}>
          {label}
        </Button>
      </MenuTrigger>
      <MenuContent align="end" className="min-w-[240px]">
        <MenuItem icon={FilePlus} onSelect={() => void open()}>
          Page vierge
        </MenuItem>
        {templates.length > 0 && <MenuSeparator />}
        {templates.length > 0 && <MenuLabel>D’après un modèle</MenuLabel>}
        {templates.map((template) => (
          <MenuItem key={template.id} icon={FileText} onSelect={() => void open(template.id)}>
            {pageTitle(template)}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
