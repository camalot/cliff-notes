import Editor, { type Monaco } from "@monaco-editor/react";
import { Card, CardHeader, CardTitle } from "./ui/card";
import { IconButton } from "./ui/IconButton";
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
  const handleBeforeMount = (monaco: Monaco) => {
    registerCliffToml(monaco);
  };

  return (
    <Card className="flex flex-col min-h-0">
      <CardHeader>
        <CardTitle>cliff.toml</CardTitle>
        <IconButton icon="arrow-clockwise" label="Reset to default" onClick={onReset} />
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
