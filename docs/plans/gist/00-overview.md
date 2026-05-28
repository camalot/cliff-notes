# Gist Save/Load — Overview & Architecture

Parent plan for all GitHub Gist save/load work. Read this first.

---

## Decisions Made

| Question | Decision |
|---|---|
| Where do Gist API calls run? | **Server-side proxy** — browser → Fastify → GitHub API |
| PAT vs OAuth token | **Both**: OAuth token (already in session) used automatically when logged in; PAT accepted as `X-GitHub-Token` header as override/fallback |
| OAuth scope change needed | `"read:user"` → `"read:user gist"` — required for write access |
| Existing sessions after scope change | Treated as PAT-required until user re-authenticates |
| project-id change | **Decouple** — keep session UUID (`cliff-notes:project-id:v1`) for rate-limit header, add new per-playground `playgroundId` for content addressing |
| Gist folder encoding | Clean paths: `<project-uuid>/<playground-uuid>.cliff-notes` + JSON metadata files |
| Gist privacy on creation | **User chooses** via toggle in Save to Gist modal |
| Number of gists | **One global gist** — single Gist ID saved in `localStorage` holds all projects |
| Metadata file contents | `{ id, name, description, createdAt, updatedAt }` (JSON) |
| Save button behavior | **Split button** — main area = last-used action, chevron = dropdown menu |

---

## Gist File Structure

GitHub Gist is flat but supports `/` in filenames, creating a virtual folder hierarchy.

```
cliff-notes.gist                                  ← marker file, identifies this as a cliff-notes gist
<project-uuid>.metadata                           ← project metadata (JSON)
<project-uuid>/<playground-uuid>.cliff-notes      ← playground content (existing YAML format)
<project-uuid>/<playground-uuid>.metadata         ← playground metadata (JSON)
```

### Metadata File Format

`<project-uuid>.metadata`:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "My Git Project",
  "description": "Changelogs for my OSS project",
  "createdAt": "2026-05-28T12:00:00.000Z",
  "updatedAt": "2026-05-28T12:00:00.000Z"
}
```

`<project-uuid>/<playground-uuid>.metadata`:
```json
{
  "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "name": "v2.0 Release Notes",
  "description": "",
  "createdAt": "2026-05-28T12:00:00.000Z",
  "updatedAt": "2026-05-28T12:10:00.000Z"
}
```

`cliff-notes.gist`:
```json
{
  "version": "1",
  "app": "cliff-notes.dev"
}
```

### File Tree After 2 Projects, 3 Playgrounds

```
cliff-notes.gist
abc-project-uuid.metadata
abc-project-uuid/
  playground-1-uuid.cliff-notes
  playground-1-uuid.metadata
  playground-2-uuid.cliff-notes
  playground-2-uuid.metadata
xyz-project-uuid.metadata
xyz-project-uuid/
  playground-3-uuid.cliff-notes
  playground-3-uuid.metadata
```

---

## Token Resolution (Server Side)

On every Gist proxy request, the server resolves a GitHub token using this priority:

1. `X-GitHub-Token` request header (PAT, never stored server-side)
2. `session.accessToken` from the `sid` session cookie (OAuth token, requires `gist` scope)
3. If neither: return `401 Unauthenticated`

The server checks if the resolved token has `gist` scope before returning a useful error
("Your current login doesn't have Gist permission. Re-login or provide a PAT.").

---

## New Concepts Introduced

### `playgroundId`

Currently `getProjectId()` returns a browser-session UUID used in `.cliff-notes` metadata and
as `X-Project-Id` rate-limit header. This is repurposed:

- `getProjectId()` and `cliff-notes:project-id:v1` remain **unchanged** — still used for rate limiting only.
- New `playgroundId?: string` field added to `PersistedState` and `AppState` — per-playground UUID.
- Generated via `crypto.randomUUID()` on first save to Gist; stored in state so it's stable.
- Used as the filename segment: `<project-uuid>/<playgroundId>.cliff-notes`.

### `projectGroupId`

Introduced alongside `playgroundId` — a UUID identifying the project container (the "folder" in the Gist).

- Stored in `AppState` as `gistProjectId?: string`.
- Set when saving to Gist (user picks an existing project or creates a new one).
- Not persisted in `.cliff-notes` file — only in `AppState` memory and Gist metadata.

---

## Unit Dependency Order

Implement in this order to avoid blocked work:

```
Unit 1: Backend Gist API (proxy routes + OAuth scope)
  └─ Needed by: all frontend Gist operations

Unit 2: Gist File Format (types, parsing, utilities)
  └─ Needed by: GistExplorer, Save modal, Load modal

Unit 3: PAT / Gist Config Storage (localStorage helpers)
  └─ Needed by: GistExplorer, Save modal, Load modal

Unit 4: GistExplorer Component (tree view)
  └─ Needed by: Save modal, Load modal

Unit 5: Save to Gist (split button + SaveToGistModal)
  └─ Standalone after Units 1–4

Unit 6: Load from Gist (LoadPlaygroundModal changes)
  └─ Standalone after Units 1–4

Unit 7: Testing (all units)
  └─ Can be written alongside each unit
```

---

## Files Changed / Created

### New files

| Path | Description |
|---|---|
| `apps/api/src/routes/gist.ts` | Gist proxy routes |
| `apps/api/src/services/gist.ts` | GitHub Gist API service |
| `apps/web/src/lib/gist-config.ts` | PAT + Gist ID localStorage helpers |
| `apps/web/src/lib/gist-format.ts` | Gist file structure types + parsing |
| `apps/web/src/components/GistExplorer.tsx` | Tree view component |
| `apps/web/src/components/SaveToGistModal.tsx` | Save to Gist dialog |
| `apps/web/src/components/ui/SplitButton.tsx` | Split button UI primitive |

### Modified files

| Path | Change |
|---|---|
| `apps/api/src/services/github-oauth.ts` | Add `gist` to OAuth scope |
| `apps/api/src/server.ts` | Register `gistRoutes` |
| `apps/api/src/config.ts` | No changes needed (authEnabled already controls gist access) |
| `apps/web/src/lib/storage.ts` | Add `playgroundId?: string` to `PersistedState` |
| `apps/web/src/lib/playground-file.ts` | Use `state.playgroundId` in metadata `id` field |
| `apps/web/src/lib/api.ts` | Add Gist API methods |
| `apps/web/src/store.ts` | Add `playgroundId`, `gistProjectId` state + actions |
| `apps/web/src/components/Toolbar.tsx` | Replace Save button with SplitButton |
| `apps/web/src/components/LoadPlaygroundModal.tsx` | Add Gist section + explorer view |

---

## Out of Scope (Not in This Plan)

- Multi-gist management (one global gist only)
- Conflict resolution when two clients update the same gist simultaneously
- Gist search / discovery across the user's GitHub account
- Gist visibility change after creation
