# Session state & undo/redo

`src/shared/state/`. One `useReducer` + context, immer for updates, mounted **above the router** in
`App.tsx`.

The data shapes it holds are described in [pdf-pipeline.md](pdf-pipeline.md) §1.

---

## 1. One session, shared by every tool

`StoreProvider` wraps the router, so a loaded document survives moving between tools. This is
deliberate (`spec/data-model.md` §3.1): the model is one working session shared by every tool, not
an upload per screen. A user merges, then navigates to Delete pages, then to Rotate, without
re-uploading. "Start over" (`RESET`) is the only thing that clears it.

```ts
const { state, dispatch, canUndo, canRedo, fileCount } = useStore();
```

`AppState { sources, pages, past, future }`. `fileCount` is the number of distinct sources still
contributing at least one page — used for the workspace's "N pages from M files" header.

`StoreProvider` accepts an optional `initial` state. It exists as the hydration point for session
recovery (not yet built) and is what tests seed state through.

---

## 2. Reducer shape

Two layers, and the split matters:

- `coreReducer` — pure state transitions via immer's `produce`. No history bookkeeping.
- `reducer` — wraps it and adds/consumes history. **`UNDO`/`REDO` are handled entirely here and
  never reach `coreReducer`.**

Actions:

```ts
| { type: 'ADD_SOURCE'; source; pages }
| { type: 'DELETE_PAGE'; pageId }
| { type: 'ROTATE_PAGE'; pageId; delta }
| { type: 'ROTATE_ALL'; delta }
| { type: 'REORDER'; pages }        // the FULL reordered array
| { type: 'ADD_DOC_ANNOTATION'; annotation }
| { type: 'UPDATE_DOC_ANNOTATION'; annotation }
| { type: 'DELETE_DOC_ANNOTATION'; annotationId }
| { type: 'ADD_ASSET'; asset }
| { type: 'RESET' }
| { type: 'UNDO' } | { type: 'REDO' }
```

---

## 3. History rules

Undo snapshots the whole edit slice — `EditSnapshot { pages, docAnnotations }` — not per-field.
Undoing a watermark edit and undoing a page delete therefore share one linear history; there is no
way to undo just one axis. Page-number annotations join the same slice when built.

- **Undoable:** `ADD_SOURCE`, `DELETE_PAGE`, `ROTATE_PAGE`, `ROTATE_ALL`, `REORDER`,
  `ADD_DOC_ANNOTATION`, `UPDATE_DOC_ANNOTATION`, `DELETE_DOC_ANNOTATION` (the `UNDOABLE` set in
  `store.tsx`).
- **`ADD_ASSET` is deliberately NOT undoable** (`spec/edge-cases.md`): assets are append-only and
  keyed by content hash (FNV-1a, `shared/lib/hash.ts`), so re-uploading identical bytes reuses the
  entry and there is nothing meaningful to roll back to.
- **Not undoable:** `RESET` — a whole-session replacement, so it clears history instead of being
  recorded in it.
- **Cap: 50 entries** (`HISTORY_LIMIT`), oldest silently dropped.
- **A fresh undoable action clears the redo stack.**
- **A no-op action never touches history.** The wrapper compares `nextState === state` by
  reference, which is cheap because immer structurally shares unchanged subtrees. Deleting a page id
  that no longer exists, or dropping a page back where it started, creates no undo step. `REORDER`
  compares ids before assigning so that a drag landing where it started stays a genuine no-op.
- **Deleting a page never drops its `SourceDoc`.** Undo has to restore the bytes without re-reading
  the file (`spec/features.md` §1.4). `sources` is append-only for the life of a session; only
  `RESET` empties it.

Undoing an `ADD_SOURCE` therefore removes the added pages but leaves the source in `sources` —
which is what makes redo cheap and correct.

### Rotation

`ROTATE_PAGE`/`ROTATE_ALL` take a `delta` (always `ROTATION_STEP`, 90) and accumulate:
`normalizeRotation(page.rotation + delta)`, folded into 0..359. Two clicks = 180. This is the
*stored* rotation; it is added again to the source page's own `/Rotate` at assembly time — see
[pdf-pipeline.md](pdf-pipeline.md) §3.

`normalizeRotation` lives in `shared/lib/rotation.ts` and is dependency-free on purpose, so the
store does not pull the PDF layer into the main bundle.

---

## 4. Keyboard shortcuts

`useUndoRedoShortcuts(dispatch)`, called inside `StoreProvider`, so it is global with no wiring per
page:

| Keys | Action |
|---|---|
| `Ctrl/Cmd+Z` | Undo |
| `Ctrl/Cmd+Shift+Z` | Redo |
| `Ctrl+Y` | Redo |

**Suppressed while focus is inside an `<input>`, `<textarea>`, `<select>` or `contentEditable`**,
so the browser's own text undo keeps working — otherwise typing a split range and pressing Ctrl+Z
would silently roll back a page edit (`spec/features.md` §1.12).

`spec/features.md` §1.12 also puts undo/redo *buttons* in the AppBar. The nav bar is
registry-generated and out of scope for the current step, so they live in the workspace toolbar
instead. The shortcuts are global either way.

---

## 4b. The unlock gate (`useUnlockGate.tsx`)

Not undo-related, but it is the reason `SourceDoc.bytes` can be assumed plaintext.

Every upload path — `useAddSources` for the page-plan tools, `SingleFileToolShell` for the
transforms — runs picked bytes through `ensureDecrypted()` before anything else sees them
(`spec/features.md` §1.7). Retry order: session-cached password, then an empty string (which is
what owner-only files need), then a visible prompt with unlimited retries and a Skip action that
continues the rest of a batch.

The password lives in `shared/state/sessionPassword.ts` — module-scoped, **memory only**, never
written to storage, cleared on Start Over. It is deliberately outside `AppState` so it can never be
captured in an undo snapshot or a future persisted session.

Only `UnlockTool` opts out, via `SingleFileToolShell`'s `acceptEncrypted` — decrypting is its job,
so it needs the encrypted bytes.

---

## 5. Working with immer here

- `SourceDoc.bytes` is a `Uint8Array`. immer treats typed arrays as atomic — it neither drafts nor
  freezes them — so the bytes stay usable by pdf-lib after they enter state. Do not "fix" this by
  cloning into a plain array.
- Return early from a `produce` recipe without mutating when an action should be a no-op; that
  preserves the reference equality the history wrapper depends on.

---

## 6. Session autosave & recovery (`shared/state/persistence/`)

Built. Behaviour is `spec/edge-cases.md` ("Persistence") and `spec/features.md` §1.12.

| File | Role |
|---|---|
| `sessionSchema.ts` | The persisted shape and every pure rule: key, 5-minute window, 800ms constant, `asBytes`, validation. No IndexedDB, no React. |
| `sessionStore.ts` | The only IndexedDB code in the app: `loadSession` / `saveSession` / `clearSession`. |
| `useSessionAutosave.ts` | `planAutosave()` (pure decision) + the debounced effect, mounted as `<SessionAutosave>` inside `StoreProvider`. |
| `shared/components/SessionRecoveryBanner.tsx` | Restore / Dismiss, with `Intl.RelativeTimeFormat` for the age. |

**Storage key is `pdfdemo:session:v3`, bumped from the old app's `:v2`.** The suffix exists so an
incompatible older save is ignored rather than migrated, and this rewrite deploys to the same origin
as the old app — a returning visitor can still hold an old-app `:v2` record whose shape is not v2's.
Reusing the key would hand that record straight to `fromPersisted()`. This is the opposite call from
`pdfdemo:lang`, which is deliberately *kept* because its value is a compatible scalar that must
survive the rewrite. Sessions are disposable; a preference is not.

**What is persisted:** `sources`, `pages`, `docAnnotations`, `assets` — and `savedAt`. That is the
whole of `PersistedSession`, built field-by-field by `toPersisted()` rather than by spreading state,
so adding an `AppState` field never silently starts persisting it.

**What is not, and why it structurally cannot be:**

- `past` / `future` — memory-only by design; they are not fields on `PersistedSession`. A restored
  session starts with empty history, which is the documented behaviour, not a shortcut.
- The unlock password — lives in `sessionPassword.ts`, module-scoped and outside `AppState`
  entirely, so no snapshot of state can capture it.
- `busy` / `busyMessage` — **v2 has no such fields.** The old app bundled transient UI flags into
  `AppState` (`spec/maintainability.md` #10); this rewrite never did. Nothing to exclude — but do not
  add them and then persist them.

**Timing rules:**

- Autosave is debounced **800ms**, and only re-armed when one of the four persisted slices changes
  by reference. An undo/redo push moves `past`/`future` only, so it never triggers a write.
- A save is offerable only if `now - savedAt` is within **5 minutes**. Older, absent, or unparseable
  saves produce no banner **and are left in storage** — staleness is never a reason to delete.
  Only Restore, Dismiss, and Start Over clear a record.
- Autosave is **suspended entirely** while the banner is pending (and while the initial check is in
  flight), and a suspended pass does not record the state as seen. Otherwise a write of the empty
  pre-restore state would overwrite the record being offered.
- An empty session is never written.

**Hydration goes through `StoreProvider`'s `initial` prop** — the point it was always documented
for. `App.tsx` holds a `key`; Restore bumps it, remounting the provider so `useReducer`
re-initialises from the restored state. There is deliberately no `HYDRATE` action: a second
state-seeding path is exactly what `initial` exists to avoid.

**IndexedDB is used natively, not via `idb-keyval`.** A deliberate implementation deviation from the
old app — same behaviour, no new dependency, ~60 lines for get/put/delete against one key. Every
storage call resolves rather than rejects: a blocked or unavailable IndexedDB degrades to "no
autosave" and never surfaces an error. The `ArrayBuffer` re-wrap (`asBytes`) is structured-clone
behaviour and is required either way.
