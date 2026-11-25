/**
 * A random, per-browser id for this device (stored in localStorage).
 * It is not derived from any device property, so it is not a fingerprint:
 * clearing site data simply creates a new one.
 */
let memoryId: string | null = null;

export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  try {
    let id = localStorage.getItem("ours-device-id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("ours-device-id", id);
    }
    return id;
  } catch {
    memoryId ??= crypto.randomUUID();
    return memoryId;
  }
}

/** After this device was signed out remotely it gets a new id on the next login. */
export function resetDeviceId() {
  memoryId = null;
  try {
    localStorage.removeItem("ours-device-id");
  } catch {
    /* ignore */
  }
}
