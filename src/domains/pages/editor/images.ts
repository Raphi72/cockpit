/** Côté le plus long d'une image gardée dans une page : assez pour l'écran, léger pour la base. */
export const IMAGE_MAX_SIDE = 1600;

/** Images acceptées (collées, déposées ou choisies). */
export function isImageFile(file: File): boolean {
  return /^image\/(png|jpe?g|gif|webp|bmp)$/.test(file.type);
}

/**
 * Réduit une image à 1600 px au plus et la renvoie en data URL (WebP, sinon JPEG). Un GIF garde son
 * animation : il est gardé tel quel.
 */
export async function shrinkImage(file: File): Promise<{ mime: string; data: string }> {
  if (file.type === 'image/gif') return { mime: file.type, data: await readAsDataUrl(file) };
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = canvas.toDataURL('image/webp', 0.86);
  if (webp.startsWith('data:image/webp')) return { mime: 'image/webp', data: webp };
  return { mime: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.86) };
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
