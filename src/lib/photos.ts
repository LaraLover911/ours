import manifest from "@/generated/photos.json";

export type LocalPhoto = {
  id: string;
  folder: string;
  name: string;
  original: string;
  width: number;
  height: number;
  color: string;
  srcset: { src: string; width: number }[];
};

export type PhotoFolder = "abdullah" | "lara" | "together" | "memories" | "backgrounds";

const photos = (manifest as { photos: Record<PhotoFolder, LocalPhoto[]> }).photos;

export function localPhotos(folder: PhotoFolder): LocalPhoto[] {
  return photos[folder] ?? [];
}

export function allLocalPhotos(): LocalPhoto[] {
  return (Object.keys(photos) as PhotoFolder[]).flatMap((f) => photos[f]);
}

export function findLocalPhoto(id: string | null | undefined): LocalPhoto | null {
  if (!id) return null;
  return allLocalPhotos().find((p) => p.id === id) ?? null;
}

/**
 * A photo reference stored in settings: "local:<folder/name>" for files in
 * public/images, or "storage:<path>" for photos uploaded in the app.
 */
export type PhotoRef = { type: "local"; photo: LocalPhoto } | { type: "storage"; path: string };

export function parsePhotoRef(value: string | null | undefined): PhotoRef | null {
  if (!value) return null;
  if (value.startsWith("local:")) {
    const photo = findLocalPhoto(value.slice(6));
    return photo ? { type: "local", photo } : null;
  }
  if (value.startsWith("storage:")) return { type: "storage", path: value.slice(8) };
  return null;
}
