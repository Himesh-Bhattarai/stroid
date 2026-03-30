# Example 4: Persistence (localStorage)

Learn how to save store state to localStorage and auto-restore it on page reload.

## What You'll Learn

- ✅ **installPersist()** - Enable persistence feature
- ✅ **persist: true** - Mark stores to save
- ✅ **Auto-restore** - State loads from storage automatically
- ✅ **Best practices** - What to persist vs temporary data

## Run This Example

```bash
cd 04-persistence
node --import tsx index.ts
```

(Works best in browser, but script shows the concept)

## What It Does

The example demonstrates:

1. Install persistence feature
2. Create stores with `persist: true`
3. Modify store values
4. Simulate page reload
5. Show auto-restoration
6. Real-world settings app

## Pattern: Persist a Store

```typescript
import { installPersist } from "stroid/persist";

// 1. Install feature once at startup
installPersist();

// 2. Create store with persist option
createStore(
  "settings",
  { theme: "dark", fontSize: 14 },
  { persist: true }  // ← Will be saved!
);

// 3. Make changes (automatically saved)
setStore("settings", "theme", "light");

// 4. On page reload, automatically restored!
const settings = getStore("settings");
// → { theme: "light", fontSize: 14 }
```

## What Gets Saved

Actually saved (persist: true):
- ✅ User preferences (theme, language, font size)
- ✅ Settings (notifications, privacy)
- ✅ Form drafts (unsaved data)
- ✅ UI preferences (sidebar width, sort order)

NOT saved (no persist option):
- ❌ Session data (current page, search results)
- ❌ Loading states (loading spinners)
- ❌ Temporary UI state (modal open/close)
- ❌ API responses (cache differently)
- ❌ Sensitive data (tokens, passwords)

## Persisted Store Life Cycle

```
Session 1:
  1. App starts
  2. createStore("settings", {...}, {persist: true})
  3. localStorage is checked
  4. If found → Use saved data
  5. If not found → Use default data
  6. User makes changes → Auto-saved to localStorage

Session 2 (new page load):
  1. App starts
  2. createStore("settings", {...}, {persist: true})
  3. localStorage has saved data
  4. Auto-loads previous values
  5. User sees their previous preferences!
```

## Real App Example

```typescript
// Persisted: User preferences
createStore("userSettings", {
  theme: "dark",
  language: "en",
  notifications: true
}, { persist: true });

// Not persisted: Session state
createStore("session", {
  currentPage: 1,
  sidebarOpen: true
});

// On reload:
// - userSettings loads: "dark", "en", true ✅
// - session resets: defaults (page 1, sidebar open) ❌
```

## Storage Details

- **Key format**: `stroid:{storeName}`
- **Where**: Browser localStorage
- **Size limit**: ~5-10MB per domain
- **Automatic**: No code needed for transfer

Check in browser:
```javascript
// DevTools → Application → Local Storage
localStorage.getItem("stroid:settings");
```

## Best Practices

1. **Small payloads**: Don't persist huge arrays
2. **No sensitive data**: Never persist tokens/passwords
3. **One persist flag**: Per store, makes intention clear
4. **Name clearly**: Use `userPreferences` not `data`
5. **Test reloads**: Verify restore works

## Common Patterns

### Pattern 1: User Settings
```typescript
createStore("preferences", {
  theme: "light",
  fontSize: 14,
  language: "en"
}, { persist: true });
```

### Pattern 2: Form Draft
```typescript
createStore("formDraft", {
  firstName: "",
  lastName: "",
  email: ""
}, { persist: true }); // Auto-save as user types
```

### Pattern 3: Cache Settings
```typescript
createStore("searchFilters", {
  category: "all",
  sortBy: "date",
  resultsPerPage: 20
}, { persist: true }); // Remember user's choices
```

## Troubleshooting

**Q: Data not persisting?**
A: Make sure `installPersist()` is called and `persist: true` is set

**Q: Data not loading after reload?**
A: Check DevTools localStorage to verify data exists

**Q: Old data won't clear?**
A: Clear localStorage: `localStorage.clear()`

**Q: Too much data?**
A: Split into smaller stores or remove large items

## Next Steps

- **05-tab-sync** - Sync across browser tabs
- **03-async-fetching** - Combine with data loading
- **02-react-hooks** - Use in components

---

💡 **Pro Tip**: Combine persistence + sync to keep all tabs in sync across reloads!
