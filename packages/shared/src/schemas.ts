import { z } from "zod";

export const ALLOWED_REPO_HOSTS = [
  "github.com",
  "gitlab.com",
  "bitbucket.org",
  "codeberg.org",
] as const;

export type AllowedHost = (typeof ALLOWED_REPO_HOSTS)[number];

export const CONVENTIONAL_TYPES = [
  "feat",
  "fix",
  "docs",
  "build",
  "ci",
  "chore",
  "style",
  "revert",
  "refactor",
  "security",
  "perf",
  "tests",
] as const;

export type ConventionalType = (typeof CONVENTIONAL_TYPES)[number];

export const authorSchema = z.object({
  name: z.string().min(1).max(200),
  // Allow emails with special characters like [bot] used by GitHub Actions
  // Pattern allows: alphanumeric, dots, hyphens, underscores, plus, quotes, brackets in local part
  email: z.string().regex(/^[a-zA-Z0-9._+\-\[\]']+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/).max(320),
  timestamp: z.number().int().nonnegative(),
});
export type Author = z.infer<typeof authorSchema>;

export const commitSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{7,40}$/i).optional(),
  message: z.string().min(1).max(10_000),
  body: z.string().max(50_000).optional(),
  author: authorSchema.optional(),
  committer: authorSchema.optional(),
});
export type Commit = z.infer<typeof commitSchema>;

export const tagSchema = z.object({
  name: z.string().min(1).max(200),
  commitId: z.string().regex(/^[a-f0-9]{7,40}$/i).optional(),
  message: z.string().max(2000).optional(),
  timestamp: z.number().int().nonnegative().optional(),
});
export type Tag = z.infer<typeof tagSchema>;

/**
 * A release groups commits up to a particular tag. `version` of `null`/absent
 * means an unreleased group. Releases are sent oldest-first; the UI is free
 * to maintain a flat tag/commit list and convert at request time.
 */
export const releaseSchema = z.object({
  version: z.string().min(1).max(200).nullable().optional(),
  message: z.string().max(2000).optional(),
  timestamp: z.number().int().nonnegative().optional(),
  commits: z.array(commitSchema).max(5000),
});
export type Release = z.infer<typeof releaseSchema>;

export const renderOptionsSchema = z.object({
  unreleased: z.boolean().optional(),
  bumpedVersion: z.boolean().optional(),
});
export type RenderOptions = z.infer<typeof renderOptionsSchema>;

export const renderRequestSchema = z.object({
  cliffToml: z.string().min(1).max(200_000),
  releases: z.array(releaseSchema).min(1).max(500),
  options: renderOptionsSchema.optional(),
});
export type RenderRequest = z.infer<typeof renderRequestSchema>;

export const REMOTE_KINDS = [
  "github",
  "gitlab",
  "gitea",
  "bitbucket",
  "azure_devops",
] as const;
export type RemoteKind = (typeof REMOTE_KINDS)[number];

export const renderResponseSchema = z.object({
  markdown: z.string(),
  warnings: z.array(z.string()).optional(),
  nextTag: z.string().optional(),
  nextTagFallback: z.boolean().optional(),
  /** Remote integrations whose data was mocked for this render. */
  mockedRemotes: z.array(z.enum(REMOTE_KINDS)).optional(),
  /** True when one or more commit_preprocessors had replace_command stripped. */
  hasDisabledReplaceCommands: z.boolean().optional(),
  /** Pretty-printed JSON context used by the template renderer. */
  context: z.string().optional(),
});
export type RenderResponse = z.infer<typeof renderResponseSchema>;

export const repoRangeSchema = z.object({
  from: z.string().min(1).max(200).optional(),
  to: z.string().min(1).max(200).optional(),
});
export type RepoRange = z.infer<typeof repoRangeSchema>;

/**
 * Caps applied to anything fetched from a remote repo so the load stays fast
 * even on huge repositories with deep history or many tags. Surfaced in the
 * UI as help text so users know what to expect.
 */
export const MAX_REPO_COMMITS = 100;
export const MAX_REPO_TAGS = 25;

export const repoInspectRequestSchema = z.object({
  url: z.string().url().max(2048),
  range: repoRangeSchema.optional(),
  maxCommits: z.number().int().positive().max(MAX_REPO_COMMITS).optional(),
  /** Branch, tag, or ref to read from. Empty/omitted means the remote's default branch. */
  branch: z.string().min(1).max(200).optional(),
  /** Repo-relative path to the cliff.toml. Defaults to "cliff.toml". */
  cliffTomlPath: z.string().min(1).max(200).optional(),
  /** When false, skip fetching the cliff.toml from the repository. Defaults to true. */
  includeCliffToml: z.boolean().optional(),
});
export type RepoInspectRequest = z.infer<typeof repoInspectRequestSchema>;

export const repoInspectResponseSchema = z.object({
  tags: z.array(tagSchema),
  commits: z.array(commitSchema),
  cliffToml: z.string().optional(),
  defaultBranch: z.string().optional(),
});
export type RepoInspectResponse = z.infer<typeof repoInspectResponseSchema>;

export const randomCommitRequestSchema = z.object({
  type: z.enum(CONVENTIONAL_TYPES),
  breaking: z.boolean().optional().default(false),
  scope: z.string().min(1).max(50).optional(),
  count: z.number().int().min(1).max(50).optional().default(1),
});
export type RandomCommitRequest = z.infer<typeof randomCommitRequestSchema>;

export const randomCommitResponseSchema = z.object({
  commits: z.array(commitSchema),
});
export type RandomCommitResponse = z.infer<typeof randomCommitResponseSchema>;

export const errorResponseSchema = z.object({
  error: z.string(),
  detail: z.string().optional(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
