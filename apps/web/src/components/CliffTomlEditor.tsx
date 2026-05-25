import { useRef, useState } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import { Card, CardHeader, CardTitle } from "./ui/card";
import { IconButton } from "./ui/IconButton";
import { toast } from "@/lib/toast";
import {
  CLIFF_TOML_LANGUAGE_ID,
  CLIFF_TOML_THEME_ID,
  registerCliffToml,
} from "@/lib/monaco-cliff-toml";

interface Props {
  value: string;
  onChange: (next: string) => void;
  onReset: () => void;
}

export function CliffTomlEditor({ value, onChange, onReset }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [justCopied, setJustCopied] = useState(false);

  const handleBeforeMount = (monaco: Monaco) => {
    registerCliffToml(monaco);
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
    <Card className="flex flex-col min-h-0">
      <CardHeader>
        <CardTitle>cliff.toml</CardTitle>
        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept=".toml,application/toml,text/plain"
            onChange={handleFileChange}
            className="hidden"
          />
          <IconButton icon="folder2-open" label="Open cliff.toml" onClick={handleOpenClick} />
          <IconButton icon="download" label="Save cliff.toml" onClick={handleSave} />
          <IconButton
            icon={justCopied ? "check" : "copy"}
            label={justCopied ? "Copied!" : "Copy cliff.toml"}
            onClick={handleCopy}
          />
          <div role="separator" aria-orientation="vertical" className="w-px h-5 bg-border mx-1" />
          <IconButton icon="arrow-clockwise" label="Reset to default" onClick={onReset} />
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
  );
}
