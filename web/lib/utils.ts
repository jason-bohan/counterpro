import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function sanitizeBlobPathSegment(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const sanitized = trimmed
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return sanitized || "file";
}

export function buildDocumentBlobPath(ownerId: string, negotiationId: number, filename: string): string {
  const safeFilename = sanitizeBlobPathSegment(filename);
  return `documents/${ownerId}/${negotiationId}/${Date.now()}-${safeFilename}`;
}
