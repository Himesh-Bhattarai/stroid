# 🚀 Quick Start Guide

Get up and running with Stroid in 5 minutes!

## Installation

```bash
npm install stroid
```

## Minimal Example

```typescript
import { createStore, setStore, getStore } from "stroid";

// 1. Create a store
createStore("todos", {
  items: [],
  completed: 0
});

// 2. Update it
setStore("todos", "items", [
  { id: 1, text: "Learn Stroid", done: false }
]);

// 3. Read it
const todos = getStore("todos");
console.log(todos);
// Output: { items: [...], completed: 0 }
```

## React Example

```typescript
import { useStore, useSelector } from "stroid/react";

function TodoList() {
  // Auto re-renders when store changes
  const todos = useStore("todos");

  return (
    <div>
      {todos.items.map(todo => (
        <p key={todo.id}>{todo.text}</p>
      ))}
    </div>
  );
}

function CompletedCount() {
  // Only re-renders when completed count changes
  const count = useSelector("todos", s => s.completed);

  return <p>Done: {count}</p>;
}
```

## Enable Features

```typescript
import { createStore, configureStroid } from "stroid";
import { installPersist } from "stroid/persist";
import { installSync } from "stroid/sync";

// Enable features once at startup
configureStroid({ /* ... */ });
installPersist();
installSync();

// Use per-store
createStore("cart", {...}, {
  persist: true,  // Save to localStorage
  sync: true      // Sync across tabs
});
```

## Key Concepts

| Concept | Purpose | Example |
|---------|---------|---------|
| **Store** | Named state container | `createStore("user", {...})` |
| **Read** | Get current state | `getStore("user")` |
| **Write** | Update state | `setStore("user", "name", "Alex")` |
| **Subscribe** | Listen for changes | `subscribeStore("user", cb)` |
| **useStore** | React hook - full store | `useStore("user")` |
| **useSelector** | React hook - single field | `useSelector("user", s => s.name)` |

## Learning Path

1. ✅ **Start**: `01-basics` - Core operations
2. ✅ **Next**: `02-react-hooks` - React integration
3. ✅ **Then**: `04-async-fetching` - Load data
4. 🎯 **Pick**: Any advanced topic

## Common Patterns

### Pattern 1: Update Nested Object
```typescript
setStore("user", "profile", draft => {
  draft.name = "New Name";
  draft.avatar = "new-avatar.jpg";
});
```

### Pattern 2: Update Array
```typescript
setStore("todos", "items", draft => {
  draft.push({ id: 3, text: "New todo" });
  // or
  draft.splice(0, 1);  // remove first
  // or
  draft[0].done = true; // modify item
});
```

### Pattern 3: Computed Value
```typescript
const total = useSelector("cart", state =>
  state.items.reduce((sum, item) => sum + item.price, 0)
);
```

### Pattern 4: Async Data
```typescript
await fetchStore("posts", fetch("/api/posts"), {
  stateAdapter: ({ next, set }) => {
    set(draft => {
      draft.items = next.data;
      draft.loading = next.loading;
      draft.error = next.error;
    });
  }
});
```

## Debugging

### View Store State
```typescript
// In console
getStore("cart")
```

### Watch Store Changes
```typescript
subscribeStore("cart", state => {
  console.log("Cart changed:", state);
});
```

### Enable DevTools (if available)
```typescript
import { installDevTools } from "stroid/devtools";
installDevTools();
```

## Next Steps

- 📖 Read [IMPORT.md](../IMPORT.md) for detailed API guide
- 🏃 Run examples from `.sandbox/` folder
- 🎯 Check [Full API Reference](../README.md#full-api-reference)
- 💬 Ask questions in discussions

## Troubleshooting

### Store not re-rendering?
- Make sure you're using `useStore()` or `useSelector()`
- Check that you're updating with `setStore()`, not mutating directly

### Persistence not working?
- Call `installPersist()` before creating stores
- Set `persist: true` in store options

### Sync across tabs not working?
- Call `installSync()` at startup
- Set `sync: true` in store options
- Make sure tabs are same origin (domain)

## Tips & Tricks

💡 **Immutability**: Stroid uses Immer, so you can mutate draft objects:
```typescript
setStore("list", "items", draft => draft.push(newItem));
```

💡 **Type Safety**: Define store shapes as TypeScript types:
```typescript
type CartState = { items: Item[]; total: number };
createStore<CartState>("cart", {...});
```

💡 **Performance**: Use selectors for frequently changing components:
```typescript
const count = useSelector("cart", s => s.items.length); // Better
// vs
const cart = useStore("cart"); // Re-renders more often
```

---

**🎉 Ready to build? Start with [01-basics](./01-basics/)**
