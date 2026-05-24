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
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
] as const;

export type ConventionalType = (typeof CONVENTIONAL_TYPES)[number];

export const authorSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
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

export const renderRequestSchema = z.object({
  cliffToml: z.string().min(1).max(200_000),
  releases: z.array(releaseSchema).min(1).max(500),
});
export type RenderRequest = z.infer<typeof renderRequestSchema>;

export const renderResponseSchema = z.object({
  markdown: z.string(),
  warnings: z.array(z.string()).optional(),
});
export type RenderResponse = z.infer<typeof renderResponseSchema>;

export const repoRangeSchema = z.object({
  from: z.string().min(1).max(200).optional(),
  to: z.string().min(1).max(200).optional(),
});
export type RepoRange = z.infer<typeof repoRangeSchema>;

export const repoInspectRequestSchema = z.object({
  url: z.string().url().max(2048),
  range: repoRangeSchema.optional(),
  maxCommits: z.number().int().positive().max(2000).optional(),
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
