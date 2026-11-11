"use client";

import React, { useRef, useState } from "react";
import Image from "next/image";
import { Upload, X, Loader2, Camera, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadsService } from "@/lib/api/services";

export interface ImageUploaderProps {
  value?: string;
  onChange: (url: string) => void;
  className?: string;
}

export function ImageUploader({ value, onChange, className }: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be re-selected if needed
    e.target.value = "";

    setIsUploading(true);
    setError(null);
    try {
      const res = await uploadsService.uploadImage(file);
      onChange(res.url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to upload image";
      setError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = () => {
    onChange("");
  };

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {value ? (
        <div className="relative w-full h-44 rounded-xl overflow-hidden border-2 border-border bg-gray-50 group">
          <Image
            src={value}
            alt="Uploaded dish"
            fill
            sizes="400px"
            className="object-cover"
            unoptimized
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              className="h-10 px-3 rounded-lg font-medium bg-white/90 hover:bg-white text-gray-800"
            >
              Change
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={handleRemove}
              className="h-10 px-3 rounded-lg font-medium"
            >
              <X className="w-4 h-4 mr-1" />
              Remove
            </Button>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 md:hidden"
            aria-label="Remove image"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="border-2 border-dashed border-border rounded-xl p-6 text-center bg-gray-50/50 hover:bg-gray-50 transition-colors">
          {isUploading ? (
            <div className="flex flex-col items-center justify-center py-6 text-primary">
              <Loader2 className="w-8 h-8 animate-spin mb-2" />
              <span className="text-sm font-semibold">Resizing and processing image...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
                <ImageIcon className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-gray-800">
                Upload dish photo
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 mb-4">
                Auto-resized to 600px WebP for optimal tablet speed
              </p>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-11 px-4 rounded-xl border-border bg-white text-sm font-medium"
                >
                  <Upload className="w-4 h-4 mr-2 text-primary" />
                  Choose File
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => cameraInputRef.current?.click()}
                  className="h-11 px-4 rounded-xl border-border bg-white text-sm font-medium"
                >
                  <Camera className="w-4 h-4 mr-2 text-primary" />
                  Take Photo
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 mt-1 font-medium">{error}</p>
      )}
    </div>
  );
}

