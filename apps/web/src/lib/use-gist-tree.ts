import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { parseGistTree, type GistProject } from "./gist-format";
import { getGistPat } from "./gist-config";

interface UseGistTreeResult {
  projects: GistProject[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useGistTree(gistId: string | null): UseGistTreeResult {
  const [projects, setProjects] = useState<GistProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!gistId) return;
    setLoading(true);
    setError(null);
    try {
      const pat = getGistPat();
      const gist = await api.getGist(gistId, pat);
      setProjects(parseGistTree(gist.files));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load Gist";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [gistId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { projects, loading, error, refresh };
}
