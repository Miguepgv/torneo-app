import type { SupabaseClient } from "@supabase/supabase-js";

const UPLOAD_TIMEOUT_MS = 6 * 60 * 1000;
const RETRY_DELAYS_MS = [0, 2000, 4000, 7000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function uploadFileWithProgress(
  signedUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("Content-Type", file.type || "image/jpeg");
    xhr.timeout = UPLOAD_TIMEOUT_MS;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      reject(new Error("upload_http"));
    };

    xhr.onerror = () => reject(new Error("upload_network"));
    xhr.ontimeout = () => reject(new Error("upload_timeout"));
    xhr.send(file);
  });
}

function uploadErrorMessage(code: string): string {
  if (code === "upload_timeout") {
    return "La subida tardo demasiado. Espera un momento y pulsa otra vez Completar inscripcion.";
  }
  return "No se pudo enviar una foto. Comprueba que tienes cobertura (datos o WiFi) e intentalo de nuevo.";
}

/** SDK Supabase + reintentos + respaldo XHR (cubre casi todos los moviles). */
export async function uploadViaSignedToken(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  token: string,
  file: File,
  onProgress: (percent: number) => void,
  signedUrlFallback: string,
): Promise<void> {
  let lastCode = "upload_network";

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      onProgress(5);
      await sleep(RETRY_DELAYS_MS[attempt] ?? 3000);
    }

    onProgress(10 + attempt * 2);

    const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(path, token, file, {
      contentType: "image/jpeg",
      upsert: true,
    });

    if (!error) {
      onProgress(100);
      return;
    }

    lastCode = error.message?.toLowerCase().includes("timeout") ? "upload_timeout" : "upload_network";

    try {
      await uploadFileWithProgress(signedUrlFallback, file, (p) => {
        onProgress(Math.min(99, 15 + Math.round(p * 0.84)));
      });
      return;
    } catch (e) {
      lastCode = e instanceof Error ? e.message : "upload_network";
      if (lastCode !== "upload_http" && lastCode !== "upload_network" && lastCode !== "upload_timeout") {
        lastCode = "upload_network";
      }
    }
  }

  throw new Error(uploadErrorMessage(lastCode));
}
