import * as vscode from 'vscode';
import {
  completionsAt,
  hoverAt,
  signatureHelpAt,
  type CompletionItemKind,
} from '@cliff-notes/tera-lang';

const CLIFF_TOML: vscode.DocumentSelector = { language: 'cliff-toml' };

function mapKind(k: CompletionItemKind): vscode.CompletionItemKind {
  switch (k) {
    case 'variable': return vscode.CompletionItemKind.Variable;
    case 'property': return vscode.CompletionItemKind.Property;
    case 'function': return vscode.CompletionItemKind.Function;
    case 'filter':   return vscode.CompletionItemKind.Function;
    case 'test':     return vscode.CompletionItemKind.Function;
    case 'keyword':  return vscode.CompletionItemKind.Keyword;
    case 'snippet':  return vscode.CompletionItemKind.Snippet;
  }
}

export function activate(ctx: vscode.ExtensionContext): void {
  ctx.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      CLIFF_TOML,
      {
        provideCompletionItems(document, position) {
          const text = document.getText();
          const offset = document.offsetAt(position);
          return completionsAt(text, offset).map((item) => {
            const ci = new vscode.CompletionItem(item.label, mapKind(item.kind));
            const detail = item.source
              ? `${item.detail ?? ''} (${item.source})`.trim()
              : item.detail;
            if (detail) ci.detail = detail;
            if (item.documentation) {
              ci.documentation = new vscode.MarkdownString(item.documentation);
            }
            if (item.insertText) {
              ci.insertText = item.insertTextIsSnippet
                ? new vscode.SnippetString(item.insertText)
                : item.insertText;
            }
            return ci;
          });
        },
      },
      '.', '|', ' ',
    ),

    vscode.languages.registerHoverProvider(CLIFF_TOML, {
      provideHover(document, position) {
        const text = document.getText();
        const offset = document.offsetAt(position);
        const info = hoverAt(text, offset);
        if (!info) return null;
        return new vscode.Hover(new vscode.MarkdownString(info.markdown));
      },
    }),

    vscode.languages.registerSignatureHelpProvider(
      CLIFF_TOML,
      {
        provideSignatureHelp(document, position) {
          const text = document.getText();
          const offset = document.offsetAt(position);
          const info = signatureHelpAt(text, offset);
          if (!info) return null;

          const sig = new vscode.SignatureInformation(
            info.signature,
            new vscode.MarkdownString(info.description),
          );
          sig.parameters = info.params.map((p) => {
            const label = p.default !== undefined ? `${p.name}=${p.default}` : p.name;
            return new vscode.ParameterInformation(label, p.type ?? '');
          });

          const help = new vscode.SignatureHelp();
          help.signatures = [sig];
          help.activeSignature = 0;
          help.activeParameter = info.activeParameter;
          return help;
        },
      },
      '(', ',',
    ),
  );
}

export function deactivate(): void {}
