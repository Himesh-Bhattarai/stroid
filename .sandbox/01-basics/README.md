# Example 1: Core Store Operations

Learn the fundamental operations of Stroid state management.

## What You'll Learn

- ✅ **createStore()** - Create a new store
- ✅ **setStore()** - Update store values
- ✅ **getStore()** - Read current state
- ✅ **hasStore()** - Check if store exists
- ✅ **subscribeStore()** - Listen for changes
- ✅ **deleteStore()** - Clean up stores

## Run This Example

### Option 1: Run as Node.js Script
```bash
cd 01-basics
node --import tsx index.ts
```

### Option 2: Study the Code
Open `index.ts` and read the heavily commented examples.

## What It Does

The example demonstrates:

1. **Create**: Define store structure with initial values
2. **Read**: Get current store state
3. **Write**: Update individual values or nested objects
4. **Subscribe**: Listen for any changes
5. **Delete**: Remove stores you don't need
6. **Real-world example**: Multi-store food delivery app

## Example Output

```
✅ 1. Store Created
   Store: 'cart'
   Initial: { items: [], total: 0, currency: 'USD' }

📖 2. Read Store
   Current cart: { items: [], total: 0, currency: 'USD' }

✏️ 3. Write Store (Simple Value)
   After setStore('cart', 'total', 49.99)

🔔 [Subscription Triggered] ...
```

## Key Takeaways

```typescript
// Create store
createStore("cart", {
  items: [],
  total: 0
});

// Update value
setStore("cart", "total", 99.99);

// Update nested (with immer draft)
setStore("cart", "items", draft => {
  draft.push({ id: 1, name: "pizza" });
});

// Read state
const cart = getStore("cart");

// Subscribe to changes
const unsub = subscribeStore("cart", state => {
  console.log("Cart changed:", state);
});
```

## Real-World Pattern

```typescript
// Most apps have multiple stores
createStore("user", { name: null, email: null });
createStore("cart", { items: [], total: 0 });
createStore("checkout", { step: 1, method: "card" });

// Each store is independent
setStore("cart", "items", [...]);
setStore("checkout", "step", 2);

// But they work together
const user = getStore("user");
const cart = getStore("cart");
const checkout = getStore("checkout");
```

## Next Steps

After mastering basics, try:
- **02-react-hooks** - Use Stroid in React components
- **03-async-fetching** - Load data with `fetchStore()`
- **04-persistence** - Save state to localStorage

---

**💡 Tip**: Run this multiple times. Modify the values and see what changes!
