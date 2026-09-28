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
