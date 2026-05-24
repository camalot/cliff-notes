import { useEffect } from "react";
import { useAppStore } from "./store";
import { Toolbar } from "./components/Toolbar";
import { CliffTomlEditor } from "./components/CliffTomlEditor";
import { RightPanel } from "./components/RightPanel";
import { ToastContainer } from "./components/ToastContainer";

export default function App() {
  const s = useAppStore();

  // Strip the URL hash once we've consumed it, so subsequent localStorage saves
  // are authoritative and the URL stays clean.
  useEffect(() => {
    if (window.location.hash.includes("state=")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  return (
    <div className="h-screen flex flex-col">
      <Toolbar
        onReset={s.resetToDefaults}
        cliffToml={s.cliffToml}
        commits={s.commits}
        tags={s.tags}
      />
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3 p-3 min-h-0 overflow-hidden">
        <CliffTomlEditor value={s.cliffToml} onChange={s.setCliffToml} onReset={s.resetToDefaults} />
        <RightPanel
          isRendering={s.isRendering}
          onGenerate={s.render}
          markdown={s.output?.markdown ?? null}
          warnings={s.output?.warnings ?? []}
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
    </div>
  );
}
