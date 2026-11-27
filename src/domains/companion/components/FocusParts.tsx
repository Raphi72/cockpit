import { Check } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import type { ReactNode } from 'react';
import { FOCUS_LIST_VISIBLE, type FocusItem } from '../model';

/**
 * Les morceaux de l'écran de séance (fond « nuit », quel que soit le thème) : l'anneau lumineux, la
 * liste des tâches qui défile comme un générique, et la gerbe de lumière de la fin.
 */

/** Couleur de la séance : celle du mode (Travail bleu, Cours violet), verte pendant une pause. */
export const FOCUS_COLORS = { work: '#7c9cff', school: '#c39bff', rest: '#52c48a' } as const;

const RING_RADIUS = 92;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * L'anneau qui se vide à mesure que le temps passe (`progress` : la part qui reste, de 1 à 0), avec un
 * halo qui respire doucement tant que le minuteur tourne.
 */
export function FocusRing({ progress, color, running, children }: { progress: number; color: string; running: boolean; children: ReactNode }) {
  const reduced = useReducedMotion();
  const clamped = Math.min(1, Math.max(0, progress));
  return (
    <div className="relative grid size-[min(64vh,420px)] place-items-center phone:size-[min(78vw,320px)]">
      {/* Un dégradé suffit pour le halo : un flou (filter) se ferait couper en carré. */}
      <m.div
        aria-hidden
        className="pointer-events-none absolute -inset-[22%] rounded-full"
        style={{ background: `radial-gradient(circle, ${color}38 0%, ${color}14 38%, transparent 66%)` }}
        animate={running && !reduced ? { opacity: [0.45, 0.9, 0.45], scale: [0.96, 1.04, 0.96] } : { opacity: 0.5, scale: 1 }}
        transition={running && !reduced ? { duration: 6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.6 }}
      />
      <svg viewBox="0 0 200 200" className="absolute inset-0 size-full -rotate-90 overflow-visible" aria-hidden>
        <circle cx="100" cy="100" r={RING_RADIUS} fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth="2.5" />
        <circle
          cx="100"
          cy="100"
          r={RING_RADIUS}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH * (1 - clamped)}
          style={{
            filter: `drop-shadow(0 0 4px ${color}) drop-shadow(0 0 14px ${color}88)`,
            transition: running && !reduced ? 'stroke-dashoffset 1s linear, stroke 600ms ease' : 'stroke 600ms ease',
          }}
        />
      </svg>
      <div className="relative flex flex-col items-center text-center">{children}</div>
    </div>
  );
}

function NightCheck({ checked, color }: { checked: boolean; color: string }) {
  return (
    <span
      className="grid size-[18px] shrink-0 place-items-center rounded-full border transition-colors duration-[160ms]"
      style={checked ? { background: color, borderColor: color } : { borderColor: 'rgb(255 255 255 / 0.35)' }}
    >
      {checked && <Check className="size-3 text-[#05060a]" strokeWidth={3} />}
    </span>
  );
}

function FocusRow({ item, checked, color, onToggle }: { item: FocusItem; checked: boolean; color: string; onToggle: (item: FocusItem) => void }) {
  return (
    <li className="h-10">
      <button
        type="button"
        onClick={() => onToggle(item)}
        className="flex h-full w-full items-center gap-3 rounded-md px-2 text-left transition-colors duration-[120ms] hover:bg-white/5"
      >
        <NightCheck checked={checked} color={color} />
        <span className={`min-w-0 flex-1 truncate ${checked ? 'text-white/35 line-through' : 'text-white/85'}`}>{item.title}</span>
        {item.tag && <span className="max-w-[40%] shrink-0 truncate text-xs text-white/30">{item.tag}</span>}
      </button>
    </li>
  );
}

/**
 * Les tâches de la séance, en bas à droite. Au-delà de quelques lignes, elles défilent lentement vers
 * le haut, en boucle, comme un générique de fin de film ; le survol arrête le défilement pour cocher.
 */
export function FocusList({
  items,
  checked,
  color,
  onToggle,
}: {
  items: FocusItem[];
  checked: ReadonlySet<string>;
  color: string;
  onToggle: (item: FocusItem) => void;
}) {
  const reduced = useReducedMotion();
  if (items.length === 0) return null;
  const rolling = items.length > FOCUS_LIST_VISIBLE && !reduced;
  const done = items.filter((item) => checked.has(item.key)).length;
  const rows = (copy: string) =>
    items.map((item) => <FocusRow key={`${copy}${item.key}`} item={item} checked={checked.has(item.key)} color={color} onToggle={onToggle} />);
  return (
    <section aria-label="Tâches de la séance" className="w-[340px] max-w-[42vw] phone:w-full phone:max-w-none">
      <p className="mb-2 flex items-baseline justify-between px-2 text-xs tracking-wide text-white/40">
        <span>À faire</span>
        <span className="tnum">
          {done} / {items.length}
        </span>
      </p>
      <div
        className={`group relative ${rolling ? 'overflow-hidden' : 'overflow-y-auto'}`}
        style={{
          height: Math.min(items.length, FOCUS_LIST_VISIBLE) * 40,
          maskImage: rolling ? 'linear-gradient(to bottom, transparent, black 18%, black 82%, transparent)' : undefined,
        }}
      >
        {rolling ? (
          <ul
            className="group-hover:[animation-play-state:paused]"
            style={{ animation: `focus-credits ${items.length * 3.2}s linear infinite` }}
          >
            {rows('a:')}
            {/* La même liste une seconde fois : la boucle repart sans à-coup. */}
            {rows('b:')}
          </ul>
        ) : (
          <ul>{rows('')}</ul>
        )}
      </div>
    </section>
  );
}

/**
 * La fin en fête, quand tout est fait avant l'heure : deux ondes de lumière partent de l'anneau, et une
 * gerbe de points s'éloigne du centre en deux vagues.
 */
export function FocusBurst({ color }: { color: string }) {
  const reduced = useReducedMotion();
  if (reduced) return null;
  const sparks = Array.from({ length: 44 }, (_, i) => {
    const wave = i % 2;
    const angle = (i / 44) * Math.PI * 2 + (wave ? 0.07 : -0.04);
    const distance = (wave ? 300 : 210) + (i % 5) * 46;
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, size: 3 + (i % 4) * 2, delay: wave * 0.22 + (i % 3) * 0.04 };
  });
  return (
    <div aria-hidden className="pointer-events-none absolute top-1/2 left-1/2">
      {[0, 0.28].map((delay) => (
        <m.span
          key={delay}
          className="absolute -top-[200px] -left-[200px] size-[400px] rounded-full border-2"
          style={{ borderColor: color, boxShadow: `0 0 30px ${color}, inset 0 0 30px ${color}` }}
          initial={{ scale: 0.95, opacity: 0.8 }}
          animate={{ scale: 2.4, opacity: 0 }}
          transition={{ duration: 1.4, delay, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
      {sparks.map((spark, i) => (
        <m.span
          key={i}
          className="absolute rounded-full"
          style={{ width: spark.size, height: spark.size, background: color, boxShadow: `0 0 12px ${color}` }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: spark.x, y: spark.y, opacity: 0, scale: 0.4 }}
          transition={{ duration: 1.6, delay: spark.delay, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
    </div>
  );
}
