import { Button } from '../primitives/Button';
import { Dialog, DialogFooter } from './Dialog';

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  /** Sans action possible (ex. suppression bloquée) : seul « Fermer » est proposé. */
  blocked?: boolean;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  blocked = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description} width={460}>
      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          {blocked ? 'Fermer' : 'Annuler'}
        </Button>
        {!blocked && (
          <Button
            variant="danger"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        )}
      </DialogFooter>
    </Dialog>
  );
}
