import { apiClient } from "@/lib/api/client";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { env } from "@/config/env";
import type { UploadImageResult } from "@/types";

/**
 * Resizes an image file to max 600px on the longest dimension and encodes to WebP data URL.
 */
async function resizeImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const MAX_DIM = 600;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_DIM) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          }
        } else {
          if (height > MAX_DIM) {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // Try webp, fallback to jpeg
        try {
          const dataUrl = canvas.toDataURL("image/webp", 0.85);
          resolve(dataUrl);
        } catch {
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          resolve(dataUrl);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export const uploadsService = {
  async uploadImage(file: File | Blob): Promise<UploadImageResult> {
    // In mock mode only: client-side resize and return data URL
    if (env.useMock && typeof window !== "undefined") {
      try {
        const dataUrl = await resizeImageToDataUrl(file as File);
        return { url: dataUrl };
      } catch (err) {
        console.warn("Client resize fallback to API call:", err);
      }
    }

    const formData = new FormData();
    formData.append("file", file);

    const { data } = await apiClient.post<UploadImageResult>(
      ENDPOINTS.uploads.image,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      }
    );
    return data;
  },
};

