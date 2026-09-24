import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { mainNav } from './navigation';
import { useUiStore } from './ui-store';

/** Caractères produits par les touches 1 à 6 en AZERTY (sans Maj). */
const AZERTY_DIGITS: Record<string, string> = { '&': '1', é: '2', '"': '3', "'": '4', '(': '5', '-': '6' };

/**
 * Chiffre de la rangée du haut, quelle que soit la disposition du clavier :
 * d'abord la touche physique (event.code), puis le caractère (claviers virtuels, bureau à distance).
 */
export function digitFromEvent(event: Pick<KeyboardEvent, 'code' | 'key'>): string | null {
  const physical = /^(?:Digit|Numpad)(\d)$/.exec(event.code);
  if (physical) return physical[1] ?? null;
  if (/^\d$/.test(event.key)) return event.key;
  return AZERTY_DIGITS[event.key] ?? null;
}

/** Vrai si l'utilisateur tape du texte ou si une fenêtre / un menu est ouvert. */
function isBusy(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (element?.closest('input, textarea, select, [contenteditable="true"]')) return true;
  return document.querySelector('[role="dialog"], [role="menu"]') !== null;
}

/**
 * Raccourcis disponibles partout :
 * Ctrl+1…6 pour les pages, Ctrl+B pour la barre latérale, C pour le menu « Nouveau ».
 */
export function useGlobalShortcuts(): void {
  const navigate = useNavigate();
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const setNewMenuOpen = useUiStore((state) => state.setNewMenuOpen);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && !event.altKey && !event.metaKey) {
        // Ctrl+1 et Ctrl+Maj+1 fonctionnent tous les deux (en AZERTY, « 1 » demande Maj).
        const digit = digitFromEvent(event);
        const target = digit ? mainNav.find((item) => item.shortcut === digit) : undefined;
        if (target) {
          event.preventDefault();
          void navigate({ to: target.to });
          return;
        }
        if (!event.shiftKey && event.key.toLowerCase() === 'b') {
          event.preventDefault();
          toggleSidebar();
        }
        return;
      }

      if (event.key.toLowerCase() === 'c' && !event.altKey && !event.metaKey && !isBusy(event.target)) {
        event.preventDefault();
        setNewMenuOpen(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, toggleSidebar, setNewMenuOpen]);
}
