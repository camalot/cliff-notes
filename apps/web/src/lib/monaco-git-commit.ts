export const GIT_COMMIT_LANGUAGE_ID = 'git-commit';

// Types accepted by the tokenizer. `tests?` accepts both `test` and `tests`.
const TOKENIZER_TYPES = 'feat|fix|docs|build|ci|chore|style|revert|refactor|security|perf|tests?';

// Types offered in completions (preferred plural form for `tests`).
const COMPLETION_TYPES = [
  'feat', 'fix', 'docs', 'build', 'ci', 'chore', 'style',
  'revert', 'refactor', 'security', 'perf', 'tests',
] as const;

export function registerGitCommit(monaco: any) {
  if (monaco.languages.getLanguages().some((l: any) => l.id === GIT_COMMIT_LANGUAGE_ID)) return;

  monaco.languages.register({ id: GIT_COMMIT_LANGUAGE_ID });

  monaco.languages.setLanguageConfiguration(GIT_COMMIT_LANGUAGE_ID, {
    comments: { lineComment: '#' },
  });

  monaco.languages.setMonarchTokensProvider(GIT_COMMIT_LANGUAGE_ID, {
    tokenizer: {
      root: [
        [/^#.*$/, 'comment.commit'],
        [/^-{8,}$/, 'separator.commit'],
        [/^(BREAKING[ -]CHANGE)(:)/, ['breaking.footer.commit', 'operator.commit']],
        [/^([A-Za-z][A-Za-z-]+)(:)/, ['trailer.key.commit', 'operator.commit']],
        // Breaking with scope: type(scope)!:
        [new RegExp(`^(${TOKENIZER_TYPES})(\\([^)]*\\))(!)(:)`),
          ['type.breaking.commit', 'scope.commit', 'bang.commit', 'operator.commit']],
        // Breaking without scope: type!:
        [new RegExp(`^(${TOKENIZER_TYPES})(!)(:)`),
          ['type.breaking.commit', 'bang.commit', 'operator.commit']],
        // Normal with scope: type(scope):
        [new RegExp(`^(${TOKENIZER_TYPES})(\\([^)]*\\))(:)`),
          ['type.commit', 'scope.commit', 'operator.commit']],
        // Normal without scope: type:
        [new RegExp(`^(${TOKENIZER_TYPES})(:)`),
          ['type.commit', 'operator.commit']],
        [/^[ \t]*[*-] /, 'bullet.commit'],
      ],
    },
  });

  monaco.languages.registerCompletionItemProvider(GIT_COMMIT_LANGUAGE_ID, {
    provideCompletionItems: (model: any, position: any) => {
      const { lineNumber, column } = position;
      const lineContent = model.getLineContent(lineNumber);
      const textBeforeCursor = lineContent.substring(0, column - 1);
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: lineNumber,
        endLineNumber: lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions: any[] = [];

      // Header (line 1): suggest conventional commit types when cursor is in the
      // type position — i.e. before any `:` or `(`.
      if (lineNumber === 1 && /^[A-Za-z]*$/.test(textBeforeCursor)) {
        for (const t of COMPLETION_TYPES) {
          suggestions.push({
            label: t,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: `${t}: `,
            detail: 'conventional commit type',
            range,
            sortText: `0_${t}`,
          });
        }
      }

      // Body/footer: only when the header carries `!` (breaking marker),
      // suggest BREAKING CHANGE / BREAKING-CHANGE footers at line start.
      if (lineNumber > 1 && /^[A-Z-]*$/.test(textBeforeCursor)) {
        const header = model.getLineContent(1);
        const headerHasBang = /^[a-z]+(?:\([^)]*\))?!:/.test(header);
        if (headerHasBang) {
          for (const label of ['BREAKING CHANGE', 'BREAKING-CHANGE']) {
            suggestions.push({
              label,
              kind: monaco.languages.CompletionItemKind.Keyword,
              insertText: `${label}: `,
              detail: 'breaking change footer',
              range,
              sortText: `0_${label}`,
            });
          }
        }
      }

      return { suggestions };
    },
  });
}
