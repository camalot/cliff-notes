export type ProfileId =
  | "base"
  | "conventional"
  | "github"
  | "gitlab"
  | "gitea"
  | "bitbucket"
  | "azure_devops"
  | "submodule";

const REMOTE_HEADER = /^\s*\[remote\.([a-z_][a-z0-9_]*)\]\s*(?:#.*)?$/i;
const GIT_HEADER = /^\s*\[git\]\s*(?:#.*)?$/i;
const ANY_HEADER = /^\s*\[[^\]]+\]\s*(?:#.*)?$/;
const RECURSE_SUBMODULES = /^\s*recurse_submodules\s*=\s*true\s*(?:#.*)?$/i;

const REMOTE_KIND_TO_PROFILE: Record<string, ProfileId | undefined> = {
  github: "github",
  gitlab: "gitlab",
  gitea: "gitea",
  bitbucket: "bitbucket",
  azure_devops: "azure_devops",
  azuredevops: "azure_devops",
};

export function detectProfiles(tomlText: string): Set<ProfileId> {
  const active = new Set<ProfileId>(["base", "conventional"]);
  if (!tomlText) return active;

  const lines = tomlText.split(/\r?\n/);
  let inGitSection = false;

  for (const raw of lines) {
    const line = stripComment(raw);
    if (!line.trim()) continue;

    const remoteMatch = line.match(REMOTE_HEADER);
    if (remoteMatch?.[1]) {
      const profile = REMOTE_KIND_TO_PROFILE[remoteMatch[1].toLowerCase()];
      if (profile) active.add(profile);
      inGitSection = false;
      continue;
    }

    if (GIT_HEADER.test(line)) {
      inGitSection = true;
      continue;
    }

    if (ANY_HEADER.test(line)) {
      inGitSection = false;
      continue;
    }

    if (inGitSection && RECURSE_SUBMODULES.test(line)) {
      active.add("submodule");
    }
  }

  return active;
}

function stripComment(line: string): string {
  // A naive strip — does not handle `#` inside strings, but cliff.toml headers
  // and `recurse_submodules = true` lines never legitimately contain `#`.
  const hashIdx = line.indexOf("#");
  return hashIdx === -1 ? line : line.slice(0, hashIdx);
}
