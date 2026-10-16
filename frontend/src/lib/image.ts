// perkecil foto di browser sebelum diunggah (sisi terpanjang 1600px, JPEG 80%).
// Foto HP biasanya 3–8 MB; setelah diperkecil ±300–600 KB, jadi upload cepat dan muat di batas 10 MB.

const MAX_SIDE = 1600;
const QUALITY = 0.8;
export const ACCEPTED_IMAGES = ["image/jpeg", "image/png", "image/webp"];

export async function compressImage(file: File): Promise<File> {
  if (!ACCEPTED_IMAGES.includes(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", QUALITY));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // browser tidak bisa memproses -> kirim apa adanya
  }
}

/** Urutkan file sesuai nama (hal1, hal2, ... hal10) supaya urutan halaman benar. */
export function sortByName(files: File[]): File[] {
  return [...files].sort((a, b) => a.name.localeCompare(b.name, "id", { numeric: true }));
}
