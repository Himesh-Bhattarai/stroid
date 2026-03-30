# Example 5: Tab Synchronization

Learn how to sync store state across browser tabs and windows in real-time.

## What You'll Learn

- ✅ **installSync()** - Enable sync feature
- ✅ **sync: true** - Mark stores to sync
- ✅ **Real-time updates** - Changes appear instantly across tabs
- ✅ **BroadcastChannel API** - The technology behind it

## Run This Example

```bash
cd 05-tab-sync
node --import tsx index.ts
```

(Best observed in browser with multiple tabs)

## What It Does

The example demonstrates:

1. Install sync feature
2. Create stores with `sync: true`
3. Show subscription notifications
4. Simulate multi-tab updates
5. Real-world collaborative shopping example

## Pattern: Sync a Store

```typescript
import { installSync } from "stroid/sync";

// 1. Install feature once at startup
installSync();

// 2. Create store with sync option
createStore(
  "cart",
  { items: [], total: 0 },
  { sync: true }  // ← Will sync across tabs!
);

// 3. Users open multiple tabs
// Tab 1 & Tab 2 at same origin (domain)

// 4. Change in Tab 1
setStore("cart", "items", [{ id: 1, name: "Pizza" }]);

// 5. Tab 2 INSTANTLY sees the change!
const cart = getStore("cart");
// → { items: [{ id: 1, name: "Pizza" }], total: 0 }
```

## Real-World Scenario

```
User Story: Family Shopping List

10:00 - Mom opens shopping app (Tab 1)
        Creates store with sync: true

10:05 - Dad opens same app (Tab 2)
        → His tab syncs with mom's store

10:10 - Mom adds "Milk"
        → Dad's Tab 2 instantly shows "Milk"
        → No page refresh needed!
        → No API call needed!

10:12 - Dad removes "Bread"
        → Mom's Tab 1 instantly updates
        → Cart stays in sync automatically

10:15 - Mom adds "Butter"
        → Dad sees it immediately
        → They're working on same list!
```

## What Syncs vs Doesn't

### Does Sync (sync: true)
- ✅ Shopping cart items
- ✅ Shared notes
- ✅ Collaborative documents
- ✅ Shared settings
- ✅ Notifications
- ✅ Activity status

### Doesn't Sync (no sync option)
- ❌ Modal open/close (personal UI)
- ❌ Theme preference (user choice)
- ❌ Sidebar open/close (personal layout)
- ❌ Debug info (developer only)
- ❌ Form input focus (temporary state)

## How It Works

```
Browser Tab 1          Browser Tab 2
    │                      │
    ├─ Stroid Store        ├─ Stroid Store
    │  (cart)              │  (cart)
    │                      │
    └─ BroadcastChannel ◄──┘
       (sync: true)

Change in Tab 1:
  1. Store updates
  2. Emits via BroadcastChannel
  3. Tab 2 receives event
  4. Tab 2 store updates
  5. Components re-render

All instant (< 1ms)
No server needed
```

## Implementation Flow

```
1. installSync()           → Enable feature
                             (uses BroadcastChannel API)

2. {..., sync: true}       → Enable for store

3. setStore() any field    → Updates locally

4. BroadcastChannel       → Broadcasts to other tabs
   emits event

5. Other tabs receive     → Their stores update
   event                   automatically

6. Components re-render   → Users see changes
   (via useStore/
    useSelector)
```

## Combining with Persistence

```typescript
// Powerful combination!
createStore("settings", {...}, {
  sync: true,      // Share across tabs
  persist: true    // Remember after reload
});

Result:
- Multiple family members' tabs stay in sync
- After page reload, data is restored
- All tabs stay synchronized!
```

## Browser Support

- ✅ Chrome 54+
- ✅ Firefox 38+
- ✅ Safari 15.1+
- ✅ Edge 79+
- ✅ All modern browsers

Check: https://caniuse.com/broadcastchannel

## Best Practices

1. **Same origin only**: Sync works same domain
2. **Different windows**: Works across pop-ups too
3. **Leave tabs open**: Syncing needs active listeners
4. **Test thoroughly**: Open DevTools on multiple tabs
5. **Use for shared data**: Not personal UI state

## Common Patterns

### Pattern 1: Shopping Cart
```typescript
createStore("cart", {...}, { sync: true });
// Users opening cart in multiple tabs see same items
```

### Pattern 2: Notifications
```typescript
createStore("notifications", {...}, {
  sync: true  // All tabs show same notifications
});
```

### Pattern 3: Shared Activity
```typescript
createStore("activity", {...}, {
  sync: true  // Who's online, what's happening
});
```

## Performance Notes

- Very fast (~1ms)
- No network calls
- Works offline
- Scales well with many tabs
- BroadcastChannel is efficient

## Debugging

View synced stores:
```javascript
// In DevTools Console
getStore("cart")  // See current state
storeRegistry     // View all stores
```

Monitor syncs:
```javascript
subscribeStore("cart", state => {
  console.log("Synced updated:", state);
});
```

## Troubleshooting

**Q: Sync not working?**
A: Check all tabs are same origin (domain)

**Q: Only works in same browser?**
A: Yes, sync is client-side only

**Q: How to sync across browsers?**
A: Use an API backend with WebSockets

**Q: Want to sync to server?**
A: Pair sync with persist + API calls

## Next Steps

- **04-persistence** - Save data too
- **02-react-hooks** - Update components
- **03-async-fetching** - Load data to sync

---

💡 **Power Tip**: Open this example in 2 browser tabs and watch them sync in real-time!
