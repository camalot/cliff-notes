const ANONYMOUS = "anon";
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Normalize a client-supplied project ID for use as a queue key and filesystem
 * slug. Anything non-conforming collapses to a shared "anon" bucket so the
 * queue still serializes (the alternative — generating a fresh ID server-side
 * — would defeat the per-session guarantee on stuck clients).
 */
export function sanitizeProjectId(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return ANONYMOUS;
  return ID_RE.test(value) ? value : ANONYMOUS;
}

type Tail = Promise<unknown>;
const tails = new Map<string, Tail>();

/**
 * Serialize work per project ID. Each call waits for the previous call with
 * the same ID to settle, then runs. We never throw the predecessor's error
 * forward — the chain swallows it so an earlier failure doesn't poison later
 * requests from the same project. The returned promise still resolves/rejects
 * with the result of *this* call.
 */
export async function runForProject<T>(
  projectId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = tails.get(projectId) ?? Promise.resolve();
  let resolveSelf!: (value: unknown) => void;
  const self: Tail = new Promise<unknown>((r) => {
    resolveSelf = r;
  });
  tails.set(projectId, self);

  try {
    await prev.catch(() => undefined);
    return await fn();
  } finally {
    resolveSelf(undefined);
    // Only clear if no one queued behind us; otherwise the next caller has
    // already replaced the tail and we'd erase their slot.
    if (tails.get(projectId) === self) tails.delete(projectId);
  }
}
