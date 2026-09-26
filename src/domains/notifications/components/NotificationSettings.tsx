import { Section } from '@/ui/layout/Section';
import { Button } from '@/ui/primitives/Button';
import { Checkbox } from '@/ui/primitives/Checkbox';
import { sendTestNotification, useNotificationRules } from '../hooks';
import { NOTIFICATION_RULES } from '../model';

/** Paramètres › Notifications : une case par règle, et une notification d'essai. */
export function NotificationSettings() {
  const { rules, setRule } = useNotificationRules();
  if (!rules) return null;
  return (
    <Section title="Notifications" meta="tant que Cockpit est ouvert, même réduit">
      <div className="flex flex-col gap-3">
        {NOTIFICATION_RULES.map(({ rule, label, hint }) => (
          <Checkbox key={rule} checked={rules[rule]} onChange={(checked) => setRule(rule, checked)}>
            <span>
              {label}
              <span className="ml-2 text-meta text-ink-3">{hint}</span>
            </span>
          </Checkbox>
        ))}
      </div>
      <p className="mt-4 text-meta text-ink-3">
        Les rappels du jour arrivent à l’ouverture de Cockpit, puis chaque matin à 8 h s’il est resté ouvert.
      </p>
      <Button variant="ghost" onClick={sendTestNotification} className="mt-3 -ml-3">
        Envoyer une notification d’essai
      </Button>
    </Section>
  );
}
