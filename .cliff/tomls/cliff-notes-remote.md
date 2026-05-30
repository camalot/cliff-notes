---
title: Cliff-Notes Remote
parent: Built-in cliff.toml
nav_order: {{ nav_order }}
---

<!-- markdownlint-disable MD025 MD022 -->
# {{ title }}
{: .no_toc }

This toml focuses on remote configuration of [git-cliff](https://github.com/orhun/git-cliff). It works with all remote repositories. But it also falls back to local configuration if no remote repository is detected.

## Supported Remote Repositories

- GitHub
- GitLab
- Gitea
- Bitbucket
- Azure DevOps

## Optional Configuration

| Option | Description | Default |
| --- | --- | --- |
| SHOW_STATISTICS | Show commit statistics | `true` |
| SHOW_CHART | Show statistics chart | `true` |
| SHOW_CONTRIBUTORS | Show the grouped contributors | `true` |
| GROUP_BY_SCOPE | Group commits by scope | `true` |

## Commit PreProcessors

There are two predefined commit preprocessors used to allow support for squashed commits. Specifically the format used in a squashed GitHub pull request merge.

```toml
  { pattern = '(?m)^\s*[\*-]\s*', replace = "" },
  { pattern = '(?m)^-{3,}\s*$', replace = "" },
```

> [!NOTE]
> If you define a `commit_preprocessor` with a `replace_command` it will not be executed.
