/**
 * Helpers de manipulation d'images.
 *
 * Toutes les images uploadées dans l'intranet sont compressées en WebP
 * (avec fallback JPEG) pour réduire la taille de la base Firebase.
 *
 * Stockage : les images sont en data URL base64 directement dans les
 * documents Firebase. C'est moins propre qu'un vrai bucket Storage,
 * mais ça simplifie la migration depuis l'ancien intranet.
 */

/**
 * Compresse une image depuis un File (drag & drop, input file).
 * @param file fichier image source
 * @param maxSize taille max en pixels (côté le plus long)
 * @param quality 0-1 (0.75 = bon compromis qualité/poids)
 * @returns data URL (image/webp ou image/jpeg si webp non supporté)
 */
export function compressImage(
  file: File,
  maxSize: number = 400,
  quality: number = 0.75
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture impossible'));
    reader.onload = () => {
      compressDataUrl(reader.result as string, maxSize, quality).then(resolve, reject);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Compresse une image qui est déjà en data URL (base64).
 * Utile pour recompresser des images déjà stockées dans la base.
 */
export function compressDataUrl(
  dataUrl: string,
  maxSize: number = 400,
  quality: number = 0.75
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('Image invalide'));
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > height && width > maxSize) {
        height = Math.round((height * maxSize) / width);
        width = maxSize;
      } else if (height > maxSize) {
        width = Math.round((width * maxSize) / height);
        height = maxSize;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas non supporté'));
      ctx.drawImage(img, 0, 0, width, height);

      // Tente webp en priorité, fallback jpeg
      let url = canvas.toDataURL('image/webp', quality);
      if (!url.startsWith('data:image/webp')) {
        url = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(url);
    };
    img.src = dataUrl;
  });
}

/**
 * Calcule la taille approximative en octets d'une data URL.
 * Une data URL base64 fait ~33% de plus que les bytes binaires originaux.
 */
export function dataUrlSize(dataUrl: string): number {
  if (!dataUrl || !dataUrl.startsWith('data:')) return 0;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return 0;
  const base64 = dataUrl.slice(commaIdx + 1);
  // 4 caractères base64 = 3 octets ; on retire le padding
  const padding = (base64.match(/=+$/) || [''])[0].length;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * Formate une taille en octets en chaîne lisible (KB, MB).
 */
export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(2)} Mo`;
}
