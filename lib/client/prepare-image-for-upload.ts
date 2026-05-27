/** Tamano pensado para DNI en movil: legible y sube bien con datos/WiFi flojos. */
const MAX_EDGE_PX = 1360;
const TARGET_MAX_BYTES = 520_000;
const MIN_JPEG_QUALITY = 0.55;

function looksLikeImage(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(file.name);
}

function isHeic(file: File): boolean {
  if (/heic|heif/i.test(file.type)) return true;
  return /\.heic$/i.test(file.name) || /\.heif$/i.test(file.name);
}

async function blobToJpegFile(blob: Blob, baseName: string): Promise<File> {
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}

async function decodeHeicToJpegBlob(file: File): Promise<Blob | null> {
  if (!isHeic(file)) return null;
  try {
    const mod = await import("heic2any");
    const heic2any = mod.default;
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
    return Array.isArray(out) ? out[0] : out;
  } catch {
    return null;
  }
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });
}

async function resizeToJpeg(source: Blob, baseName: string): Promise<File> {
  if (typeof createImageBitmap !== "function") {
    throw new Error("bitmap");
  }

  const bitmap = await createImageBitmap(source);
  let edge = MAX_EDGE_PX;
  let quality = 0.82;
  let lastFile: File | null = null;

  try {
    for (let attempt = 0; attempt < 8; attempt++) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height, 1));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");

      ctx.drawImage(bitmap, 0, 0, width, height);
      const blob = await canvasToJpegBlob(canvas, quality);
      if (!blob) throw new Error("blob");

      lastFile = await blobToJpegFile(blob, baseName);
      if (lastFile.size <= TARGET_MAX_BYTES) return lastFile;

      if (quality > MIN_JPEG_QUALITY + 0.05) {
        quality -= 0.08;
      } else {
        edge = Math.round(edge * 0.85);
        quality = 0.78;
      }
    }

    if (lastFile) return lastFile;
    throw new Error("size");
  } finally {
    bitmap.close?.();
  }
}

/**
 * Deja cada foto lista para subir en cualquier movil (iPhone HEIC, Android, etc.)
 * sin pedir al usuario que cambie ajustes.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  if (!looksLikeImage(file)) {
    return file.type ? file : await blobToJpegFile(file, "archivo");
  }

  const baseName = file.name.replace(/\.[^.]+$/i, "") || "foto";

  if (file.size <= TARGET_MAX_BYTES && /^image\/jpe?g$/i.test(file.type)) {
    return file;
  }

  let source: Blob = file;

  const heicBlob = await decodeHeicToJpegBlob(file);
  if (heicBlob) source = heicBlob;

  try {
    return await resizeToJpeg(source, baseName);
  } catch {
    if (heicBlob) {
      try {
        return await resizeToJpeg(heicBlob, baseName);
      } catch {
        /* sigue abajo */
      }
    }
  }

  if (file.size > 2_500_000) {
    throw new Error(
      "No se pudo preparar la foto en este movil. Haz otra foto del DNI mas cerca (que llene el recuadro) e intentalo otra vez.",
    );
  }

  return file.type === "image/jpeg" ? file : await blobToJpegFile(file, baseName);
}
