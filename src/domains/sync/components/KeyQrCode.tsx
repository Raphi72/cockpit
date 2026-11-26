import { encode } from 'uqr';
import { syncQrPayload } from '../model';

/**
 * Le code de la clé en code QR, à scanner avec le téléphone (choix de l'étape 10). Toujours noir sur
 * blanc, même en thème sombre : les appareils photo le lisent mieux.
 */
export function KeyQrCode({ code }: { code: string }) {
  const qr = encode(syncQrPayload(code), { ecc: 'M', border: 2 });
  const cells: string[] = [];
  qr.data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) cells.push(`M${x} ${y}h1v1h-1z`);
    }),
  );
  return (
    <svg
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      className="my-3 size-48 rounded-lg bg-white"
      shapeRendering="crispEdges"
      role="img"
      aria-label="Code QR de la clé de synchronisation"
    >
      <path d={cells.join('')} fill="#000" />
    </svg>
  );
}
