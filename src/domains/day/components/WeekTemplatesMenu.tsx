import { CalendarRange, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/ui/overlays/Menu';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { Button } from '@/ui/primitives/Button';
import { InlineText } from '@/ui/primitives/InlineFields';
import { Input } from '@/ui/primitives/Input';
import { useApplyWeekTemplate, useDeleteWeekTemplate, useRenameWeekTemplate, useSaveWeekTemplate, useWeekTemplates } from '../hooks';
import type { DayBlock, WeekTemplate } from '../model';

/** Nommer une nouvelle semaine type, faite des blocs de la semaine affichée. */
function SaveAsDialog({ open, onOpenChange, blocks }: { open: boolean; onOpenChange: (open: boolean) => void; blocks: DayBlock[] }) {
  const [name, setName] = useState('');
  const save = useSaveWeekTemplate();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === '') return;
    save.mutate({ blocks, name }, { onSuccess: () => onOpenChange(false) });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Nouvelle semaine type" description={`Les ${blocks.length} blocs de cette semaine, jour par jour.`}>
      {open && (
        <form onSubmit={submit} className="mt-5">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Semaine de cours, semaine de vacances…" aria-label="Nom de la semaine type" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" disabled={name.trim() === '' || save.isPending}>
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      )}
    </Dialog>
  );
}

/** Gérer les semaines types : renommer, remplacer par la semaine affichée, supprimer (avec « Annuler »). */
function ManageDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; templates: WeekTemplate[]; blocks: DayBlock[] }) {
  const rename = useRenameWeekTemplate();
  const remove = useDeleteWeekTemplate();
  const save = useSaveWeekTemplate();
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange} title="Semaines types" description="Appliquer une semaine type crée des blocs ordinaires : la changer ensuite ne touche pas les semaines déjà remplies.">
      <ul className="mt-4">
        {props.templates.map((template) => (
          <li key={template.id} className="group grid min-h-11 grid-cols-[minmax(0,1fr)_auto_auto_32px] items-center gap-3">
            <InlineText value={template.name} onSave={(name) => rename.mutate({ id: template.id, name })} required aria-label="Nom" />
            <span className="tnum text-meta text-ink-3">{template.blockCount} blocs</span>
            <Button
              variant="ghost"
              disabled={props.blocks.length === 0}
              title="Remplacer ses blocs par ceux de la semaine affichée"
              onClick={() => save.mutate({ blocks: props.blocks, replaceId: template.id })}
            >
              Remplacer par cette semaine
            </Button>
            <Button
              variant="ghost"
              icon={Trash2}
              aria-label={`Supprimer « ${template.name} »`}
              className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
              onClick={() => remove.mutate(template.id)}
            />
          </li>
        ))}
      </ul>
      {props.templates.length === 0 && <p className="mt-4 text-ink-3">Aucune semaine type pour l’instant.</p>}
      <DialogFooter>
        <Button variant="primary" onClick={() => props.onOpenChange(false)}>
          Fermer
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

/**
 * Semaines types (P18), plusieurs et nommées : appliquer l'une aux jours affichés, enregistrer la
 * semaine affichée comme nouvelle semaine type, ou les gérer.
 */
export function WeekTemplatesMenu({ weekDays, weekBlocks }: { weekDays: string[]; weekBlocks: DayBlock[] }) {
  const { data: templates = [] } = useWeekTemplates();
  const apply = useApplyWeekTemplate();
  const [saving, setSaving] = useState(false);
  const [managing, setManaging] = useState(false);
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" icon={CalendarRange}>
            Semaines types
          </Button>
        </MenuTrigger>
        <MenuContent align="end" className="min-w-[260px]">
          {templates.length > 0 && <MenuLabel>Appliquer à cette semaine</MenuLabel>}
          {templates.map((template) => (
            <MenuItem
              key={template.id}
              onSelect={() => apply.mutate({ weekTemplateId: template.id, days: weekDays, name: template.name })}
              disabled={template.blockCount === 0}
            >
              {template.name}
              <span className="ml-auto pl-3 text-meta text-ink-3">{template.blockCount} blocs</span>
            </MenuItem>
          ))}
          {templates.length > 0 && <MenuSeparator />}
          <MenuItem onSelect={() => setSaving(true)} disabled={weekBlocks.length === 0}>
            Enregistrer cette semaine comme semaine type…
          </MenuItem>
          {templates.length > 0 && <MenuItem onSelect={() => setManaging(true)}>Gérer les semaines types…</MenuItem>}
        </MenuContent>
      </Menu>
      <SaveAsDialog open={saving} onOpenChange={setSaving} blocks={weekBlocks} />
      <ManageDialog open={managing} onOpenChange={setManaging} templates={templates} blocks={weekBlocks} />
    </>
  );
}
