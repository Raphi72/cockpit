import { useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from '@/ui/overlays/toast';
import {
  checkUpdate,
  downloadAndOpenInstaller,
  installUpdate,
  onUpdateReady,
  pendingUpdate,
  updatesAvailable,
  updatesByApk,
  type UpdateInfo,
} from './native';

/** Le message reste le temps d'être lu ; ignoré, la mise à jour du PC s'installe à l'ouverture suivante. */
const READY_TOAST_MS = 20_000;
/** Le téléphone regarde peu après l'ouverture, puis toutes les 6 heures tant que l'appli est ouverte. */
const PHONE_FIRST_CHECK_MS = 15_000;
const PHONE_EVERY_MS = 6 * 3600_000;

/** Une version n'est annoncée qu'une fois par lancement. */
const announced = new Set<string>();

function announceReady(info: UpdateInfo): void {
  if (announced.has(info.version)) return;
  announced.add(info.version);
  toast(`Cockpit ${info.version} est prête.`, {
    duration: READY_TOAST_MS,
    action: { label: 'Redémarrer', onClick: () => void installUpdate().catch((error: unknown) => toast(String(error), { tone: 'danger' })) },
  });
}

/** Téléphone : télécharger l'APK puis ouvrir l'écran « Installer ». */
async function installOnPhone(): Promise<void> {
  toast('Téléchargement de la mise à jour…');
  await downloadAndOpenInstaller();
}

function announceAvailable(info: UpdateInfo): void {
  if (announced.has(info.version)) return;
  announced.add(info.version);
  toast(`Cockpit ${info.version} est disponible.`, {
    duration: READY_TOAST_MS,
    action: { label: 'Installer', onClick: () => void installOnPhone().catch((error: unknown) => toast(String(error), { tone: 'danger' })) },
  });
}

/**
 * Annonce une nouvelle version publiée sur GitHub. Le PC la télécharge de lui-même (côté Rust) et
 * prévient quand elle est prête ; le téléphone regarde de temps en temps. Hors ligne : rien, sans erreur.
 */
export function useUpdateNotifier(): void {
  useEffect(() => {
    if (!updatesAvailable()) return;
    if (updatesByApk()) {
      const look = () => void checkUpdate().then((info) => info && announceAvailable(info), () => undefined);
      const first = setTimeout(look, PHONE_FIRST_CHECK_MS);
      const timer = setInterval(look, PHONE_EVERY_MS);
      return () => {
        clearTimeout(first);
        clearInterval(timer);
      };
    }
    void pendingUpdate().then((info) => info && announceReady(info), () => undefined);
    const unlisten = onUpdateReady(announceReady);
    return () => void unlisten.then((stop) => stop());
  }, []);
}

/** « Rechercher une mise à jour » (Paramètres) : le résultat est dit dans un message. */
export function useCheckUpdate() {
  return useMutation({
    mutationFn: checkUpdate,
    onSuccess: (info) => {
      if (!info) return toast('Cockpit est à jour.');
      announced.delete(info.version);
      if (updatesByApk()) announceAvailable(info);
      else announceReady(info);
    },
    onError: () => toast('Impossible de joindre GitHub. Vérifie la connexion à Internet.', { tone: 'danger' }),
  });
}
