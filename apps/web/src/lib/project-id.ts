const LS_KEY = "cliff-notes:project-id:v1";

function generate(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID (older test runners).
  return `pid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

let cached: string | null = null;

export function getProjectId(): string {
  if (cached) return cached;
  try {
    const existing = localStorage.getItem(LS_KEY);
    if (existing) {
      cached = existing;
      return existing;
    }
    const fresh = generate();
    localStorage.setItem(LS_KEY, fresh);
    cached = fresh;
    return fresh;
  } catch {
    if (!cached) cached = generate();
    return cached;
  }
}
