import { randomBytes } from "node:crypto";

const DEFAULT_MAX_SESSIONS = 10_000;

export interface SessionData {
  login: string;
  avatarUrl: string;
  accessToken: string;
  createdAt: number;
  lastAccessedAt: number;
}

/**
 * Simple LRU session store backed by a Map (insertion-order).
 * When the store reaches maxSize, the least-recently-used entry is evicted
 * and a warning is logged so operators can diagnose unexpected logouts.
 */
class LruSessionStore {
  private readonly map = new Map<string, SessionData>();

  constructor(
    private readonly maxSize: number,
    private readonly ttlMs: number,
  ) {}

  get(id: string): SessionData | undefined {
    const entry = this.map.get(id);
    if (!entry) return undefined;

    if (Date.now() - entry.lastAccessedAt > this.ttlMs) {
      this.map.delete(id);
      return undefined;
    }

    // Refresh LRU position by re-inserting
    const updated: SessionData = { ...entry, lastAccessedAt: Date.now() };
    this.map.delete(id);
    this.map.set(id, updated);
    return updated;
  }

  set(id: string, data: SessionData): void {
    // Evict LRU if at capacity (only when inserting a new key)
    if (!this.map.has(id) && this.map.size >= this.maxSize) {
      const lruKey = this.map.keys().next().value;
      if (lruKey !== undefined) {
        this.map.delete(lruKey);
        console.warn(
          `[session-store] Evicted session ${lruKey} due to capacity limit (max=${this.maxSize}). ` +
            "Users may experience unexpected logouts. Consider raising SESSION_MAX_SESSIONS.",
        );
      }
    }
    // Re-insert to refresh LRU position for updates
    this.map.delete(id);
    this.map.set(id, data);
  }

  delete(id: string): void {
    this.map.delete(id);
  }
}

// Module-level singleton initialised in buildServer
let store: LruSessionStore | null = null;

export function initSessionStore(
  maxSize = DEFAULT_MAX_SESSIONS,
  ttlSeconds = 604_800,
): void {
  store = new LruSessionStore(maxSize, ttlSeconds * 1000);
}

export function getSession(id: string): SessionData | undefined {
  return store?.get(id);
}

export function setSession(id: string, data: SessionData): void {
  store?.set(id, data);
}

export function deleteSession(id: string): void {
  store?.delete(id);
}

export function generateSessionId(): string {
  return randomBytes(16).toString("hex");
}
