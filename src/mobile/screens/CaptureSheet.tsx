import { AnimatePresence, useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { useEffect, useRef, useState } from 'react';
import { useCaptureInbox } from '@/domains/inbox/hooks';
import { cleanInboxText } from '@/domains/inbox/model';
import { transitionFor } from '@/ui/motion/presets';
import { Button } from '@/ui/primitives/Button';
import { toast } from '@/ui/overlays/toast';

/**
 * Capture rapide du téléphone : une idée, une tâche, un devoir… dans la boîte de réception, triée plus tard
 * sur le PC. Le panneau monte du bas, le clavier s'ouvre tout de suite.
 */
export function CaptureSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const capture = useCaptureInbox();
  const reduced = useReducedMotion();
  const [text, setText] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) requestAnimationFrame(() => field.current?.focus());
  }, [open]);

  const save = () => {
    const cleaned = cleanInboxText(text);
    if (!cleaned) return;
    capture.mutate(cleaned, {
      onSuccess: () => {
        toast('Dans la boîte de réception.');
        setText('');
        onClose();
      },
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <m.div
          key="capture"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transitionFor('page', reduced)}
          className="fixed inset-0 z-40 bg-backdrop"
          onClick={onClose}
        >
          <m.div
            role="dialog"
            aria-label="Capture rapide"
            initial={{ y: 40 }}
            animate={{ y: 0 }}
            exit={{ y: 40 }}
            transition={transitionFor('toast', reduced)}
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-elevated px-5 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-overlay"
          >
            <textarea
              ref={field}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Une idée, une tâche, un devoir…"
              aria-label="Texte à capturer"
              rows={3}
              className="w-full resize-none bg-transparent text-[17px] outline-none placeholder:text-ink-3"
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="lg" onClick={onClose}>
                Annuler
              </Button>
              <Button variant="primary" size="lg" disabled={!cleanInboxText(text) || capture.isPending} onClick={save}>
                Capturer
              </Button>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
