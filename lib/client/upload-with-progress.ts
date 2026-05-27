const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

export function uploadFileWithProgress(
  signedUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
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
      reject(new Error(`No se pudo subir el archivo (codigo ${xhr.status}).`));
    };

    xhr.onerror = () => reject(new Error("Error de red al subir. Comprueba la conexion e intentalo de nuevo."));
    xhr.ontimeout = () =>
      reject(new Error("La subida tardo demasiado. Prueba con mejor senal WiFi o datos moviles."));

    xhr.send(file);
  });
}

export async function uploadFileWithRetry(
  signedUrl: string,
  file: File,
  onProgress: (percent: number) => void,
  retries = 1,
): Promise<void> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) onProgress(0);
      await uploadFileWithProgress(signedUrl, file, onProgress);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Error desconocido al subir.");
    }
  }
  throw lastError ?? new Error("No se pudo subir el archivo.");
}
