import { Faker, en } from "@faker-js/faker";
import { CONVENTIONAL_TYPES, type Commit, type ConventionalType } from "./schemas.js";

const SCOPES: Record<ConventionalType, string[]> = {
  feat: ["api", "ui", "auth", "parser", "config", "cli", "render", "search"],
  fix: ["api", "ui", "auth", "parser", "config", "cli", "render"],
  docs: ["readme", "api", "examples", "config"],
  style: ["ui", "css", "lint"],
  refactor: ["api", "ui", "parser", "store"],
  perf: ["render", "parser", "ui"],
  tests: ["api", "ui", "shared"],
  security: ["api", "auth", "deps", "parser"],
  build: ["deps", "docker", "vite"],
  ci: ["actions", "release"],
  chore: ["deps", "release", "lint"],
  revert: [],
};

let rngSeed = 0;

export interface RandomCommitOptions {
  /** Conventional type; omit (or pass undefined) to randomize per-commit. */
  type?: ConventionalType;
  breaking?: boolean;
  scope?: string;
  count?: number;
  /** Optional seed for deterministic generation, used by tests. */
  seed?: number;
  /** Squash multiple commits into a single multi-line commit. Only valid when count >= 2. */
  squash?: boolean;
  /** Number of random co-authors to include in footer (0-5). Only meaningful when squash=true. */
  coAuthors?: number;
}

function pickType(opts: RandomCommitOptions, faker: Faker): ConventionalType {
  return opts.type ?? faker.helpers.arrayElement(CONVENTIONAL_TYPES);
}

function makeScope(type: ConventionalType, opts: RandomCommitOptions, faker: Faker): string | undefined {
  if (opts.scope !== undefined) return opts.scope;
  const scopes = SCOPES[type];
  if (scopes.length > 0 && faker.number.float() < 0.6) {
    return faker.helpers.arrayElement(scopes);
  }
  return undefined;
}

function buildHeader(type: ConventionalType, scope: string | undefined, breaking: boolean, faker: Faker): string {
  const subject =
    type === "revert"
      ? `"${faker.git.commitMessage()}"`
      : faker.git.commitMessage();
  return scope !== undefined
    ? `${type}(${scope})${breaking ? "!" : ""}: ${subject}`
    : `${type}${breaking ? "!" : ""}: ${subject}`;
}

function buildSquashedCommit(
  commits: Commit[],
  opts: RandomCommitOptions,
  faker: Faker,
  baseTimestamp: number
): Commit {
  const parts: string[] = [commits[0]!.message.split("\n")[0]!, ""];

  for (const commit of commits) {
    parts.push(`* ${commit.message.split("\n")[0]!}`);
    if (faker.number.float() < 0.5 && commits.length > 1) {
      const n = faker.number.int({ min: 1, max: 3 });
      for (let i = 0; i < n; i++) {
        const prefix = faker.number.float() < 0.6 ? "  -" : "  ";
        parts.push(`${prefix} ${faker.git.commitMessage()}`);
      }
    }
  }

  parts.push("");

  if (faker.number.float() < 0.4) {
    parts.push(faker.lorem.sentence());
    parts.push("");
  }

  const numCoAuthors = Math.min(opts.coAuthors ?? 0, 5);
  if (numCoAuthors > 0) {
    parts.push("--------");
    parts.push("");
    for (let i = 0; i < numCoAuthors; i++) {
      parts.push(`co-authored-by: ${faker.internet.displayName()} <${faker.internet.email()}>`);
    }
  }

  const message = parts.join("\n");

  return {
    id: faker.git.commitSha({ length: 40 }),
    message,
    author: {
      name: faker.internet.displayName(),
      email: faker.internet.email(),
      timestamp: baseTimestamp,
    },
    committer: {
      name: faker.internet.displayName(),
      email: faker.internet.email(),
      timestamp: baseTimestamp,
    },
  };
}

export function generateRandomCommits(opts: RandomCommitOptions): Commit[] {
  const count = opts.count ?? 1;
  const breaking = opts.breaking ?? false;
  const seed = opts.seed ?? ((Date.now() ^ (rngSeed++ * 0x9e3779b1)) >>> 0);
  const faker = new Faker({ locale: [en] });
  faker.seed(seed);

  const baseTimestamp = Math.floor(Date.now() / 1000);

  if (opts.squash && count >= 2) {
    const individualCommits: Commit[] = [];
    for (let i = 0; i < count; i++) {
      const type = pickType(opts, faker);
      const scope = makeScope(type, opts, faker);
      const header = buildHeader(type, scope, breaking, faker);
      const body = breaking ? "BREAKING CHANGE: behavior intentionally changed; see release notes." : undefined;
      const message = body ? `${header}\n\n${body}` : header;
      individualCommits.push({
        id: faker.git.commitSha({ length: 40 }),
        message,
        body,
        author: {
          name: faker.internet.displayName(),
          email: faker.internet.email(),
          timestamp: baseTimestamp - (count - i) * 60,
        },
        committer: {
          name: faker.internet.displayName(),
          email: faker.internet.email(),
          timestamp: baseTimestamp - (count - i) * 60,
        },
      });
    }
    return [buildSquashedCommit(individualCommits, opts, faker, baseTimestamp)];
  }

  const commits: Commit[] = [];
  for (let i = 0; i < count; i++) {
    const type = pickType(opts, faker);
    const scope = makeScope(type, opts, faker);
    const header = buildHeader(type, scope, breaking, faker);
    const body = breaking ? "BREAKING CHANGE: behavior intentionally changed; see release notes." : undefined;
    const message = body ? `${header}\n\n${body}` : header;
    commits.push({
      id: faker.git.commitSha({ length: 40 }),
      message,
      body,
      author: {
        name: faker.internet.displayName(),
        email: faker.internet.email(),
        timestamp: baseTimestamp - (count - i) * 60,
      },
      committer: {
        name: faker.internet.displayName(),
        email: faker.internet.email(),
        timestamp: baseTimestamp - (count - i) * 60,
      },
    });
  }
  return commits;
}
