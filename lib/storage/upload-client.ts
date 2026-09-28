/**
 * Client-Side Direct Storage Upload Helper
 * Uploads media files directly from the browser to Supabase Storage using signed upload URLs.
 * This completely avoids sending multi-megabyte audio files through Next.js Server Actions or Vercel serverless functions,
 * eliminating the 4.5 MB payload limit and timeout issues.
 */

export interface UploadProgressCallback {
  (percent: number, loadedBytes: number, totalBytes: number): void;
}

export function uploadFileToSignedUrl(
  signedUrl: string,
  file: File,
  contentType?: string,
  onProgress?: UploadProgressCallback
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl, true);

    const type = contentType || file.type || "application/octet-stream";
    xhr.setRequestHeader("Content-Type", type);

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
          onProgress(percent, event.loaded, event.total);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        let errorDetails = "";
        try {
          const parsed = JSON.parse(xhr.responseText);
          errorDetails = parsed.message || parsed.error || xhr.responseText;
        } catch {
          errorDetails = xhr.responseText || xhr.statusText;
        }

        if (
          xhr.status === 400 &&
          (errorDetails.toLowerCase().includes("exceeded the maximum allowed size") ||
           errorDetails.toLowerCase().includes("payload too large"))
        ) {
          const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
          errorDetails = `El archivo "${file.name}" (${sizeMb} MB) supera el tamaño máximo permitido por Supabase Storage (50 MB por defecto). Soluciones: 1) Exporta el audio en WAV 16-bit 44.1kHz para mantenerlo bajo 50 MB, o 2) Si tienes Supabase Pro, sube el "Upload file size limit" en Supabase Dashboard > Project Settings > Storage.`;
        }

        reject(new Error(`Storage upload failed (${xhr.status}): ${errorDetails}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network connection error while uploading file directly to storage. Check your internet connection."));
    };

    xhr.ontimeout = () => {
      reject(new Error("Upload timed out. Please try again."));
    };

    xhr.send(file);
  });
}
