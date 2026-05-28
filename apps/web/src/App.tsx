import { useEffect, useState } from "react";
import { useAppStore } from "./store";
import { Toolbar } from "./components/Toolbar";
import { CliffTomlEditor } from "./components/CliffTomlEditor";
import { RightPanel } from "./components/RightPanel";
import { ToastContainer } from "./components/ToastContainer";
import { IntegrityErrorModal } from "./components/IntegrityErrorModal";
import { UntrustedBanner } from "./components/UntrustedBanner";
import { decodeAndVerify } from "./lib/storage";
import { IntegrityError } from "./lib/integrity";
import { downloadPlayground } from "./lib/playground-file";
import type { PersistedState } from "./lib/storage";
import type { UiCommit, UiTag } from "./types";

type StartupPhase = "loading-hash" | "ready";

interface PendingIntegrityError {
  error: IntegrityError;
  recoveredState?: PersistedState;
}

export default function App() {
  const s = useAppStore();
  const [phase, setPhase] = useState<StartupPhase>(
    () => (window.location.hash ? "loading-hash" : "ready"),
  );
  const [integrityError, setIntegrityError] = useState<PendingIntegrityError | null>(null);

  // ── URL-hash startup verification ─────────────────────────────────────────
  useEffect(() => {
    if (phase !== "loading-hash") return;

    const hash = window.location.hash;
    if (!hash) {
      setPhase("ready");
      return;
    }

    void (async () => {
      // Strip the hash regardless of outcome so it doesn't persist on reload.
      window.history.replaceState(null, "", window.location.pathname);

      try {
        const state = await decodeAndVerify(hash);
        s.applyPersistedState(state);
        s.setUntrusted(false);
      } catch (err) {
        const error = err instanceof IntegrityError
          ? err
          : new IntegrityError("missing-field");

        // Best-effort recovery from the LZ payload even when hash is bad.
        let recoveredState: PersistedState | undefined;
        try {
          const { decodeFromUrlHash } = await import("./lib/storage");
          const decoded = decodeFromUrlHash(hash);
          recoveredState = decoded?.state;
        } catch {
          /* legacy-format or unrecoverable — no payload to offer */
        }

        setIntegrityError({ error, recoveredState });
      } finally {
        setPhase("ready");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── default cliff.toml ────────────────────────────────────────────────────
  useEffect(() => {
    if (!s.cliffToml) {
      void s.loadDefaultConfig();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── auth state ────────────────────────────────────────────────────────────
  useEffect(() => {
    void s.fetchUser();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── integrity error raised by child components (file load etc.) ───────────
  const showIntegrityError = (error: IntegrityError, recoveredState?: PersistedState) => {
    setIntegrityError({ error, recoveredState });
  };

  const handleIntegrityClose = () => setIntegrityError(null);

  const handleIntegrityLoadAnyway = (state: PersistedState) => {
    s.applyPersistedState(state);
    s.setUntrusted(true);
    setIntegrityError(null);
  };

  // ── file-load handler (from LoadPlaygroundModal, injected via Toolbar) ────
  const handleLoad = (state: PersistedState) => {
    s.applyPersistedState(state);
    s.setUntrusted(false);
  };

  // ── startup loading screen ────────────────────────────────────────────────
  if (phase === "loading-hash") {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-3 text-muted-fg">
        <svg
          className="animate-spin h-6 w-6 text-accent"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <span className="text-sm">Loading shared playground…</span>
        <ToastContainer />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <Toolbar
        onReset={s.resetToDefaults}
        onLoad={handleLoad}
        onIntegrityError={showIntegrityError}
        cliffToml={s.cliffToml}
        commits={s.commits}
        tags={s.tags}
        options={s.options}
        name={s.name}
        onChangeName={s.setName}
      />
      {s.untrusted && (
        <UntrustedBanner onDismiss={() => s.setUntrusted(false)} />
      )}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3 p-3 min-h-0 overflow-hidden">
        <CliffTomlEditor value={s.cliffToml} onChange={s.setCliffToml} onReset={s.resetCliffToml} />
        <RightPanel
          isRendering={s.isRendering}
          onGenerate={s.render}
          onResetConfig={s.resetConfig}
          onSave={() => downloadPlayground({ cliffToml: s.cliffToml, commits: s.commits, tags: s.tags, options: s.options, name: s.name })}
          configDirty={s.configDirty}
          markdown={s.output?.markdown ?? null}
          warnings={s.output?.warnings ?? []}
          mockedRemotes={s.output?.mockedRemotes ?? []}
          options={s.options}
          onChangeOptions={s.setOptions}
          isLoadingRepo={s.isLoadingRepo}
          onLoadRepo={s.loadFromRepo}
          tags={s.tags}
          onAddTag={s.addTag}
          onUpdateTag={s.updateTag}
          onRemoveTag={s.removeTag}
          onClearTags={s.clearTags}
          commits={s.commits}
          onAddCommit={(message) => s.addCommit({ message })}
          onAddRandomCommits={s.insertRandomCommits}
          onUpdateCommit={s.updateCommit}
          onRemoveCommit={s.removeCommit}
          onMoveCommit={s.moveCommit}
          onClearCommits={s.clearCommits}
          onTagHere={(idx) =>
            s.addTag({ name: `v${(s.tags.length + 1).toString()}.0.0`, afterIndex: idx })
          }
        />
      </main>
      <ToastContainer />

      {integrityError && (
        <IntegrityErrorModal
          error={integrityError.error}
          recoveredState={integrityError.recoveredState}
          onClose={handleIntegrityClose}
          onLoadAnyway={
            integrityError.recoveredState ? handleIntegrityLoadAnyway : undefined
          }
        />
      )}
    </div>
  );
}
