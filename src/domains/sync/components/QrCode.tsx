import { encode } from 'uqr';

/**
 * Un code QR, à lire avec le téléphone (choix de l'étape 10). Toujours noir sur blanc, même en thème
 * sombre : les appareils photo le lisent mieux.
 */
export function QrCode({ text, label }: { text: string; label: string }) {
  const qr = encode(text, { ecc: 'M', border: 2 });
  const cells: string[] = [];
  qr.data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) cells.push(`M${x} ${y}h1v1h-1z`);
    }),
  );
  return (
    <svg viewBox={`0 0 ${qr.size} ${qr.size}`} className="my-3 size-72 rounded-lg bg-white" shapeRendering="crispEdges" role="img" aria-label={label}>
      <path d={cells.join('')} fill="#000" />
    </svg>
  );
}
