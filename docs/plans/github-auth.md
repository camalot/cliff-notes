# GitHub Authentication

Adds user authentication via GitHub OAuth to the cliff-notes playground.
A login button lives in the toolbar; once authenticated the user sees their
avatar, a dropdown menu with username / Settings / Logout, and the session
persists across page reloads via an HttpOnly server-side session cookie.

> **Critique note:** This document was rubber-ducked against a senior-engineer
> critique pass. Accepted items are incorporated inline. A summary of the
> critique and acceptance decisions follows the main plan in the
> [Critique review](#critique-review) section.

---

## Goals

1. Allow users to sign in with GitHub from a toolbar icon in the top-right of
   the action buttons.
2. When logged out show the `vsc:account` icon; when logged in show the user's
   GitHub avatar.
3. Clicking the avatar opens a dropdown with:
   - Username (display only)
   - **Settings** (`go:gear`) — disabled for now
   - Separator
   - **Logout** (`go:sign-out`)
4. Clicking the `vsc:account` icon (logged-out state) opens a `LoginModal`.
5. The modal supports GitHub today with a visible extension point for future
   providers (GitLab, Bitbucket, …).
6. Session persists across browser refreshes via an HttpOnly, Secure,
   SameSite=Lax cookie — the user does not need to re-login on every visit.
7. Logout clears the server-side session and removes the cookie.

## Non-goals

- No per-user data storage or sync.  Auth is a foundation; what gets stored
  per-user is out of scope for this plan.
- No role-based access control.
- No email/password authentication.
- No profile editing.
- Settings menu item is intentionally disabled; its future content is out of
  scope.

---

## Architecture overview

```
Browser                        API (Fastify)               GitHub
──────                         ─────────────               ──────
Click "Login with GitHub"
  └─ open popup to
     /api/auth/github   ──────► redirect to GitHub ──────►
                                                     user authorises
                         ◄────── callback with code ◄──────
                         exchange code for token ──────────►
                         fetch user profile  ◄──────────────
                         create server session
                         set-cookie: sid=<id>
popup close + postMessage ◄────
main window calls /api/auth/me
  ◄──── { login, avatarUrl } ──
```

**Why a popup instead of a full-page redirect?**
A redirect would navigate the user away from the playground, discarding any
unsaved in-memory state. A popup preserves the active editor state.

---

## Session strategy

| Concern | Decision |
|---|---|
| Session store | In-memory map (dev/single-instance); plug in Redis for production via an env-configured adapter |
| Session ID | Cryptographically random 128-bit hex, stored in an HttpOnly Secure SameSite=Lax cookie named `sid` |
| GitHub access token | Stored server-side in the session map, never sent to the browser |
| Session TTL | 7 days, sliding on activity |
| Auth state in browser | Zustand slice populated by `GET /api/auth/me` on app start |

Using **server-side sessions** (rather than JWTs) keeps the GitHub access token
server-side and makes logout truly instant — there is no token to invalidate on
the client.

---

## Backend changes

### New environment variables / config

| Variable | Default | Purpose |
|---|---|---|
| `GITHUB_CLIENT_ID` | *(required when auth enabled)* | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | *(required when auth enabled)* | GitHub OAuth App client secret |
| `GITHUB_CALLBACK_URL` | `http://localhost:3001/api/auth/github/callback` | Must match GitHub App settings |
| `SESSION_SECRET` | *(required when auth enabled)* | ≥ 32-char random secret for signing/encryption |
| `AUTH_ENABLED` | `false` | Feature flag; when `false` all `/api/auth/*` routes return 501 |
| `SESSION_TTL_SECONDS` | `604800` (7 days) | Sliding session lifetime |

These extend `AppConfig` in `apps/api/src/config.ts`.

### New Fastify plugins

| Package | Purpose |
|---|---|
| `@fastify/cookie` | Cookie parsing and setting |
| `@fastify/session` | Server-side session with pluggable store |
| `@fastify/oauth2` | GitHub OAuth2 flow helpers (PKCE support) |
| `@fastify/rate-limit` | Rate limiting on auth endpoints |
| `@fastify/helmet` | Baseline security headers (CSP, HSTS, etc.) |

### New route file: `apps/api/src/routes/auth.ts`

```
GET  /api/auth/github              → redirect to GitHub authorization URL
GET  /api/auth/github/callback     → exchange code, set session cookie, close popup
GET  /api/auth/me                  → return { login, avatarUrl } or 401
POST /api/auth/logout              → destroy session, clear cookie
```

#### `GET /api/auth/github`
Builds the GitHub authorization URL with scopes `read:user` and redirects.
No session is written at this stage.

#### `GET /api/auth/github/callback`
1. Verify the `state` query param against the `oauth_state` cookie; reject with
   400 if they do not match (CSRF protection).
2. Exchange the `code` query param for an access token via GitHub's token
   endpoint. Also send `code_verifier` for PKCE verification.
3. Call `GET https://api.github.com/user` with the token to fetch
   `login` and `avatar_url`.
4. **Validate `avatar_url`**: assert `new URL(avatarUrl).hostname ===
   'avatars.githubusercontent.com'`; discard if invalid.
5. Call `await request.session.regenerate()` to prevent session fixation, then
   write `{ login, avatarUrl, accessToken }` into the session store and set
   the `sid` cookie.
6. Return an HTML page that calls
   `window.opener.postMessage({ type: 'auth:success' }, APP_ORIGIN)` then
   closes itself.  **No user data is included in the postMessage payload** —
   the main window retrieves authoritative user data from `/api/auth/me`.
   - The `APP_ORIGIN` value is server-configured (never derived from the
     request) to prevent open-redirect injection.
   - The callback HTML is served with a strict `Content-Security-Policy`:
     `default-src 'none'; script-src 'unsafe-inline'` and
     `Cache-Control: no-store`.
   - Guard against a null opener:
     ```js
     if (window.opener) {
       window.opener.postMessage({ type: 'auth:success' }, APP_ORIGIN);
     }
     // always close — fallback to query-param detection handled by main window
     window.close();
     ```

#### `GET /api/auth/me`
Reads `sid` cookie → looks up session → returns `{ login, avatarUrl }` with
`Cache-Control: no-store, private` or `401 { error: 'unauthenticated' }`.
When LRU eviction has dropped the session the response is
`401 { error: 'session_evicted' }` so the frontend can distinguish "never
logged in" from "was logged in but session dropped."

#### `POST /api/auth/logout`
Reads `sid` cookie → deletes session from store → clears cookie (expires it)
→ returns `204`.

### Security notes

- The GitHub `client_secret` and access tokens are never sent to the browser.
- **CSRF:** The `state` parameter is included in the OAuth redirect and verified
  in the callback. A random `state` value is stored in a short-lived cookie
  (`oauth_state`, SameSite=Lax, 10-minute TTL) before redirecting, and the
  callback verifies it matches before proceeding.
- **PKCE:** A `code_verifier` is generated at redirect time, stored in the
  `oauth_state` cookie alongside `state`, and sent in the token exchange.
  GitHub OAuth Apps have supported PKCE since 2023.
- **Session fixation:** The callback calls `await request.session.regenerate()`
  before writing auth data. Any pre-existing session is destroyed.
- The `sid` cookie is `HttpOnly`, `Secure` (enforced when `NODE_ENV=production`),
  and `SameSite=Lax`.
- Session store has a maximum capacity (e.g. 10 000 entries) with LRU eviction
  to prevent unbounded memory growth. An eviction warning is logged. Evicted
  sessions surface as `{ error: 'session_evicted' }` in API responses.
- **`avatarUrl` validation:** before storing in the session, the server asserts
  the hostname is `avatars.githubusercontent.com`. Invalid values are discarded.
- **Rate limiting** (`@fastify/rate-limit`): `/api/auth/github/callback` is
  capped at 10 req/min per IP; `/api/auth/me` at 60 req/min.
- **Content-Security-Policy** (`@fastify/helmet`): applied globally. The inline
  callback HTML page receives its own strict per-route CSP override
  (`default-src 'none'; script-src 'unsafe-inline'`). The SPA's CSP includes
  `img-src https://avatars.githubusercontent.com` to allow GitHub avatars.
- **`Cache-Control: no-store, private`** is set on `/api/auth/me` and
  `/api/auth/logout` to prevent CDN or proxy caching of identity data.
- All redirects in the callback use an allowlist for the `redirect_uri`.

---

## Frontend changes

### New auth slice: `apps/web/src/store.ts`

Add a `user` field and related actions to the existing Zustand store:

```ts
interface AuthUser {
  login: string;
  avatarUrl: string;
}

// Added to AppState:
user: AuthUser | null;
authLoading: boolean;        // initialised to true, not false
loginModalOpen: boolean;     // controls LoginModal visibility
fetchUser: () => Promise<void>;
logout: () => Promise<void>;
setLoginModalOpen: (open: boolean) => void;
```

`authLoading` is initialised to **`true`** so the Toolbar renders a neutral
placeholder until the first `/api/auth/me` response. Setting it to `false`
initially would cause a flash of the logged-out icon for every authenticated
user on page load.

`fetchUser` calls `GET /api/auth/me`. It is called once on app start in
`App.tsx` inside a `useEffect`. On a 401 it sets `user: null` silently.

`logout` calls `POST /api/auth/logout` then sets `user: null`.

`loginModalOpen` lives in the store (not in `Toolbar` local state) so that a
401 interceptor in `lib/api.ts` can call
`useAppStore.getState().setLoginModalOpen(true)` to programmatically prompt
re-authentication when a future protected endpoint returns 401.

### New API helpers: `apps/web/src/lib/api.ts`

```ts
export async function fetchCurrentUser(): Promise<AuthUser | null>
export async function logoutUser(): Promise<void>
```

### New component: `apps/web/src/components/LoginModal.tsx`

A modal dialog (follows the pattern of `ShareModal.tsx`) with:
- A heading: "Sign in to cliff-notes"
- A subheading: "Save and sync your playgrounds across devices" *(future)*
- One button per enabled provider; for now only **"Sign in with GitHub"**
  (`go:mark-github` icon), which opens the popup.
- The button triggers `const popup = window.open('/api/auth/github',
  'github-auth', 'width=600,height=700')`.
  - If `popup` is `null` (popup blocker), show an inline error message:
    "Popups are blocked by your browser. Please allow popups for this site
    and try again." — do not silently fail.
- A `message` event listener (registered in a `useEffect`) waits for the
  popup's `postMessage`. The listener **validates `event.origin`** against the
  known API origin before acting:
  ```ts
  if (event.origin !== API_ORIGIN || event.data?.type !== 'auth:success') return;
  ```
  On a valid `auth:success` it calls `store.fetchUser()` and closes the modal.
- The `useEffect` cleanup removes the listener and calls
  `popupRef.current?.close()`. An `aborted` ref flag prevents a late-arriving
  message from triggering `fetchUser()` after modal unmount.
- ESC key and overlay click close the modal.
- The provider list is driven by a static config array so adding GitLab in the
  future is a one-line change.

### New component: `apps/web/src/components/UserMenu.tsx`

A small dropdown attached to the avatar `<button>`. Uses a pattern of a
`ref`-based click-outside handler (same idiom as other modals) to dismiss.

Structure:
```
<button> (avatar img, 28×28, rounded-full)
  └─ [on click] <div role="menu"> (absolutely positioned, top-right)
       ├─ <div> @username (muted, non-interactive)
       ├─ <button disabled> <GoGear /> Settings
       ├─ <hr /> (separator)
       └─ <button> <GoSignOut /> Logout
```

Clicking Logout calls `store.logout()`.

### Modified: `apps/web/src/components/Toolbar.tsx`

Add one new icon group at the far right of the right-hand button strip.

```tsx
// After the existing Share button group:
<span className="w-px h-5 bg-border mx-0.5" aria-hidden="true" />
{authLoading
  ? <span className="w-7 h-7" /> // neutral placeholder, prevents layout shift
  : user
    ? <UserMenu user={user} onLogout={logout} />
    : <IconButton
        icon="vsc:account"
        label="Sign in"
        onClick={() => setLoginModalOpen(true)}
      />
}
```

`loginModalOpen` and `setLoginModalOpen` come from the Zustand store (not local
state) so the modal can also be triggered programmatically (e.g. by a 401
interceptor).

### Modified: `apps/web/src/App.tsx`

Call `s.fetchUser()` once on mount alongside the existing hash-loading effect.

---

## Component tree

```
App
└─ Toolbar
   ├─ (existing buttons)
   └─ [logged out] IconButton (vsc:account) → LoginModal
      [logged in]  UserMenu
                   ├─ avatar <button>
                   └─ dropdown <div role="menu">
                        ├─ username
                        ├─ Settings (disabled)
                        ├─ <hr>
                        └─ Logout
```

---

## File changes summary

| File | Change |
|---|---|
| `apps/api/src/config.ts` | Add `authEnabled`, `githubClientId`, `githubClientSecret`, `githubCallbackUrl`, `appOrigin`, `sessionSecret`, `sessionTtlSeconds` |
| `apps/api/src/server.ts` | Register `@fastify/cookie`, `@fastify/session`, `@fastify/rate-limit`, `@fastify/helmet`; register `authRoutes` |
| `apps/api/src/routes/auth.ts` | **New** — 4 auth routes |
| `apps/api/src/services/github-oauth.ts` | **New** — OAuth token exchange (with PKCE), user profile fetch, `avatarUrl` validation |
| `apps/api/src/lib/session-store.ts` | **New** — In-memory LRU session store with `SessionStore` interface for future Redis adapter; eviction logging |
| `apps/web/src/store.ts` | Add `AuthUser`, `user`, `authLoading` (init `true`), `loginModalOpen`, `fetchUser`, `logout`, `setLoginModalOpen` |
| `apps/web/src/lib/api.ts` | Add `fetchCurrentUser`, `logoutUser` |
| `apps/web/src/components/LoginModal.tsx` | **New** — provider buttons, popup open with null-check, origin-validated message listener, useEffect cleanup |
| `apps/web/src/components/UserMenu.tsx` | **New** |
| `apps/web/src/components/Toolbar.tsx` | Add login/avatar button group; render placeholder while `authLoading`; use store `loginModalOpen` |
| `apps/web/src/App.tsx` | Call `fetchUser()` on mount |

---

## Configuration (GitHub OAuth App setup)

1. Create a GitHub OAuth App at **Settings → Developer settings → OAuth Apps**.
2. Set **Homepage URL** to `https://cliff-notes.dev` (or `http://localhost:5173`
   for dev).
3. Set **Authorization callback URL** to `https://cliff-notes.dev/api/auth/github/callback`
   (or the local equivalent).
4. Copy **Client ID** → `GITHUB_CLIENT_ID`.
5. Generate a **Client Secret** → `GITHUB_CLIENT_SECRET`.
6. Set `AUTH_ENABLED=true` in the deployment environment.

---

## Open items / future work

- **Redis session store** — implement `RedisSessionStore` behind the
  `SessionStore` interface when horizontal scaling is needed.
- **Settings page** — the Settings menu item is rendered but disabled; a future
  plan will define its content.
- **Additional providers** — GitLab, Bitbucket; the `LoginModal` provider array
  already has the extension point.
- **Persistent user data** — per-user saved playgrounds; requires a database.
- **Full-page redirect fallback** — for environments where popups are
  permanently blocked (iOS Safari, strict corporate proxies), implement a
  redirect-based flow that serialises editor state to `sessionStorage` before
  navigating and restores it on return. Detect popup success via a
  `?auth=success` query param when the main window has no `opener`.
- **GitHub token revocation** — if a user revokes the OAuth App in GitHub
  settings, the stored access token becomes invalid but the session persists for
  up to 7 days. GitHub OAuth Apps do not send a revocation webhook (unlike
  GitHub Apps). As a partial mitigation, the server should re-validate the
  stored token via `GET https://api.github.com/user` at most once per hour per
  session; if GitHub returns 401, destroy the session.

---

## Critique review

The plan was reviewed by a senior-engineer critique pass. All 15 items were
accepted. Here is a concise summary:

| # | Issue | Severity | Accepted? |
|---|---|---|---|
| 1 | postMessage included user data — redundant, divergent source of truth | Critical | ✅ Removed from payload |
| 2 | `LoginModal` did not validate `event.origin` on the message listener | Critical | ✅ Origin check added |
| 3 | No handling for browsers that block the popup | Important | ✅ Null-check on `window.open`; error message shown; redirect fallback added as open item |
| 4 | `window.opener` not null-checked before `postMessage` in callback HTML | Important | ✅ Guard added |
| 5 | No rate limiting on auth routes | Important | ✅ `@fastify/rate-limit` added |
| 6 | Session fixation: no `session.regenerate()` before writing auth state | Important | ✅ `regenerate()` call documented |
| 7 | PKCE deferred to "GitHub App only" — GitHub OAuth Apps support it now | Important | ✅ Moved to standard recommendation |
| 8 | No `Cache-Control: no-store` on auth endpoints | Important | ✅ Added to `/auth/me` and `/auth/logout` |
| 9 | `message` listener lifecycle undefined — stale closure / listener leak | Important | ✅ `useEffect` cleanup + abort flag pattern documented |
| 10 | LRU eviction silently logs users out with no diagnostic | Important | ✅ Eviction log + `session_evicted` error code added |
| 11 | No Content-Security-Policy | Important | ✅ `@fastify/helmet` added; CSP override on callback page; `img-src` for avatars |
| 12 | `avatarUrl` not validated before storing | Minor | ✅ Hostname allowlist check documented |
| 13 | `loginModalOpen` in local Toolbar state prevents programmatic trigger | Minor | ✅ Moved to Zustand store |
| 14 | `authLoading: false` initial value causes flash of logged-out icon | Minor | ✅ Initialised to `true` |
| 15 | GitHub token revocation not detected — stale sessions up to 7 days | Minor | ✅ Documented as known limitation; periodic re-validation added as open item |
