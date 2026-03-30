# Example 3: Async Fetching & Caching

Learn how to fetch external data and manage loading/error states automatically.

## What You'll Learn

- ✅ **fetchStore()** - Load data with auto state management
- ✅ **stateAdapter** - Customize how data is stored
- ✅ **Caching** - Avoid duplicate requests
- ✅ **refetchStore()** - Force fresh data
- ✅ **Error handling** - Built-in error states

## Run This Example

In your React app:
```bash
cp index.tsx src/
# Then use the components in your app
```

## What It Does

The example shows how to:

1. **Load User Data** - Fetch with automatic loading state
2. **Load Product List** - Array response handling
3. **Load Posts** - Multiple loads with deduplication
4. **Handle Errors** - Show error messages
5. **Refresh Data** - Bypass cache manually

## Pattern: Async Data Loading

```typescript
// Create store for async data
createStore("users", {
  items: null,
  loading: false,
  error: null,
  status: "idle" // "idle" | "loading" | "success" | "error"
});

// Fetch data
await fetchStore(
  "users",
  fetch("/api/users"), // Your API call
  {
    // Transform data into store shape
    stateAdapter: ({ next, set }) => {
      set(draft => {
        draft.items = next.data;
        draft.loading = next.loading;
        draft.error = next.error;
        draft.status = next.status;
      });
    }
  }
);

// In component
function UserList() {
  const users = useStore("users");

  if (users.loading) return <p>Loading...</p>;
  if (users.error) return <p>Error: {users.error}</p>;

  return (
    <div>
      {users.items?.map(user => (
        <div key={user.id}>{user.name}</div>
      ))}
    </div>
  );
}
```

## Caching & Deduplication

```typescript
// First request
await fetchStore("posts", fetchPromise); // ← Makes request

// Second request (immediately)
await fetchStore("posts", fetchPromise); // ← Cached! No request

// Force fresh data
await refetchStore("posts", fetchPromise); // ← Always requests
```

## Error Handling

```typescript
const result = await fetchStore("data", promise, {
  onError: (msg) => console.error(msg)
});

// In component
if (data.error) {
  return <div className="error">{data.error}</div>;
}
```

## Typical Flow

1. User triggers load (click button)
2. `loading = true` → Show spinner
3. Request starts
4. Response arrives
5. `loading = false`, `data = result` → Show data
6. If error: `error = message` → Show error

## Next Steps

- **01-basics** - Core operations review
- **04-persistence** - Combine with saving data
- **05-tab-sync** - Sync fetched data across tabs
- **06-selectors** - Optimize component re-renders

---

💡 **Note**: This example uses mock API calls with delays. Replace with real API endpoints!
