import { useEffect, useRef, useState } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import { Card, CardHeader } from "./ui/card";
import { IconButton } from "./ui/IconButton";
import { ConfirmResetModal, getSkipResetConfirm } from "./ConfirmResetModal";
import { toast } from "@/lib/toast";
import { api, type TomlEntry } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  CLIFF_TOML_LANGUAGE_ID,
  CLIFF_TOML_THEME_ID,
  registerCliffToml,
} from "@/lib/monaco-cliff-toml";
import { Icon } from "./ui/Icon";

interface Props {
  value: string;
  onChange: (next: string) => void;
  onReset: () => void;
}

export function CliffTomlEditor({ value, onChange, onReset }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [justCopied, setJustCopied] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  const handleResetClick = () => {
    if (getSkipResetConfirm()) {
      void onReset();
    } else {
      setShowResetModal(true);
    }
  };

  // Template picker
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [tomls, setTomls] = useState<TomlEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [dropdownOpen]);

  const handleToggleDropdown = async () => {
    if (!dropdownOpen && tomls.length === 0) {
      try {
        const list = await api.getTomls();
        setTomls(list);
      } catch {
        toast.error("Failed to load templates");
      }
    }
    setDropdownOpen((v) => !v);
  };

  const handleSelectConfig = async (id: string) => {
    setDropdownOpen(false);
    setIsLoadingTemplate(true);
    try {
      const toml = await api.getToml(id);
      onChange(toml);
      setSelectedId(id);
      toast.success("Template loaded", { message: id });
    } catch (err) {
      toast.error("Failed to load template", { message: String(err) });
    } finally {
      setIsLoadingTemplate(false);
    }
  };

  const handleBeforeMount = async (monaco: Monaco) => {
    await registerCliffToml(monaco);
  };

  const handleOpenClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so selecting the same file twice re-fires the event.
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      onChange(text);
      toast.success("Loaded cliff.toml", { message: file.name });
    } catch (err) {
      toast.error("Failed to read file", { message: String(err) });
    }
  };

  const handleSave = () => {
    try {
      const blob = new Blob([value], { type: "application/toml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cliff.toml";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Failed to save file", { message: String(err) });
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 1500);
      toast.success("cliff.toml copied to clipboard");
    } catch (err) {
      toast.error("Failed to copy", { message: String(err) });
    }
  };

  return (
    <>
    {showResetModal && (
      <ConfirmResetModal
        title="Reset cliff.toml"
        description="This will reset your cliff.toml to the default configuration. Any changes you've made will be lost."
        onConfirm={() => { setShowResetModal(false); void onReset(); }}
        onCancel={() => setShowResetModal(false)}
      />
    )}
    <Card className="flex flex-col min-h-0">
      <CardHeader className="p-0 gap-0">
        {/* Template picker — flush to top-left, rounded-tl-lg matching config tabs */}
        <div className="relative self-stretch flex" ref={dropdownRef}>
          <div className="overflow-hidden rounded-tl-lg self-stretch flex">
            <button
              type="button"
              onClick={handleToggleDropdown}
              disabled={isLoadingTemplate}
              title="Load a template cliff.toml"
              aria-label="Load a template cliff.toml"
              aria-expanded={dropdownOpen}
              aria-haspopup="listbox"
              className={cn(
                "inline-flex items-center gap-1.5 px-3 h-full text-xs font-bold transition-colors uppercase",
                "bg-card text-muted-fg hover:text-fg hover:bg-muted/60",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border",
                "disabled:opacity-50 disabled:pointer-events-none",
              )}
            >
              {/* <img src="/icons/toml.svg" alt="" aria-hidden="true" className="w-4 h-4" /> */}
              <Icon
                name="/icons/toml.svg"
                aria-hidden="true"
                className="w-4 h-4"
              />
              <span>cliff.toml</span>
              <Icon
                name={`vsc:chevron-${dropdownOpen ? "up" : "down"}`}
                className="text-[10px]"
                aria-hidden="true"
              />
            </button>
          </div>

          {dropdownOpen && (
            <div
              role="listbox"
              className="absolute left-0 top-full z-50 mt-px bg-card border border-border rounded-md shadow-md min-w-max py-1"
            >
              {tomls.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-fg">Loading…</div>
              ) : (
                tomls.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    role="option"
                    aria-selected={entry.id === selectedId}
                    onClick={() => handleSelectConfig(entry.id)}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-xs text-fg hover:bg-muted transition-colors flex flex-col gap-0.5",
                      entry.id === selectedId && "bg-muted",
                    )}
                  >
                    <span className="font-bold uppercase">{entry.label}</span>
                    {entry.description && (
                      <span className="text-muted-fg font-normal normal-case">
                        {entry.description}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Toolbar */}
        <div className="flex items-center gap-1 py-2 pr-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".toml,application/toml,text/plain"
            onChange={handleFileChange}
            className="hidden"
          />
          <IconButton
            icon="folder2-open"
            label="Open cliff.toml"
            onClick={handleOpenClick}
          />
          <IconButton
            icon="download"
            label="Save cliff.toml"
            onClick={handleSave}
          />
          <IconButton
            icon={justCopied ? "check" : "copy"}
            label={justCopied ? "Copied!" : "Copy cliff.toml"}
            onClick={handleCopy}
          />
          <div
            role="separator"
            aria-orientation="vertical"
            className="w-px h-5 bg-border mx-1"
          />
          <IconButton
            icon="vsc:discard"
            label="Reset to default"
            onClick={handleResetClick}
            className="text-danger/70 hover:text-danger hover:bg-danger/10"
          />
        </div>
      </CardHeader>
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          theme={CLIFF_TOML_THEME_ID}
          defaultLanguage={CLIFF_TOML_LANGUAGE_ID}
          language={CLIFF_TOML_LANGUAGE_ID}
          value={value}
          onChange={(v) => onChange(v ?? "")}
          beforeMount={handleBeforeMount}
          options={{
            fontSize: 13,
            minimap: {
              enabled: true,
              renderCharacters: false,
              showSlider: "always",
              size: "proportional",
            },
            scrollBeyondLastLine: false,
            wordWrap: "on",
            tabSize: 2,
            insertSpaces: true,
            renderWhitespace: "boundary",
            // Suppress Monaco's word-based suggestions so only the schema-aware
            // completion provider contributes — keeps suggestions on-topic.
            wordBasedSuggestions: "off",
            quickSuggestions: { other: true, comments: false, strings: true },
            suggest: {
              showWords: false,
            },
            scrollbar: {
              vertical: "visible",
              horizontal: "visible",
              useShadows: false,
              verticalScrollbarSize: 12,
              horizontalScrollbarSize: 12,
            },
          }}
        />
      </div>
    </Card>
    </>
  );
}
