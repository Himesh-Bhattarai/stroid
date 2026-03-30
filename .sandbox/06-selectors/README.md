# Example 6: Selectors & Optimized Subscriptions

Learn how to efficiently select and subscribe to specific parts of your store.

## What You'll Learn

- ✅ **selectStore()** - Subscribe with selector function
- ✅ **useSelector()** - React hook for specific fields
- ✅ **Derived values** - Compute from store state
- ✅ **Performance** - Prevent unnecessary re-renders

## Run This Example

```bash
cd 06-selectors
node --import tsx index.tsx
```

Or view in React app.

## The Problem

Your store has lots of data:
```typescript
{
  items: [...100 items...],
  filter: "show-all",
  sortBy: "date",
  total: 49.99,
  tax: 5.00,
  currency: "USD"
}
```

If you use `useStore("cart")`, your component re-renders when:
- Items change ✅ necessary
- Total changes ✅ necessary
- Filter changes ❌ doesn't affect your component!
- SortBy changes ❌ doesn't affect your component!
- Currency changes ❌ doesn't affect your component!

**Too many unnecessary re-renders!**

## The Solution: Selectors

```typescript
// ❌ BAD: Re-renders on any cart change
function PriceTag() {
  const cart = useStore("cart");
  return <p>${cart.total}</p>;
}

// ✅ GOOD: Re-renders ONLY when total changes
function PriceTag() {
  const total = useSelector("cart", state => state.total);
  return <p>${total}</p>;
}
```

## Types of Selectors

### 1. Identity Selector (Get field as-is)
```typescript
const selectName = (state) => state.name;
const selectTotal = (state) => state.total;

// Use
const total = useSelector("cart", selectTotal);
// Re-renders only if total value changes
```

### 2. Computed Selector (Transform data)
```typescript
const selectTotalPrice = (state) =>
  state.items.reduce((sum, item) => sum + item.price * item.qty, 0);

// Use
const price = useSelector("cart", selectTotalPrice);
// Re-renders when items, prices, or qty change
```

### 3. Filter Selector (Extract matching items)
```typescript
const selectCompletedTodos = (state) =>
  state.items.filter(todo => todo.done);

// Use
const done = useSelector("todos", selectCompletedTodos);
// Re-renders when done items change
```

### 4. Map Selector (Transform items)
```typescript
const selectItemNames = (state) =>
  state.items.map(item => item.name);

// Use
const names = useSelector("cart", selectItemNames);
// Re-renders when item names change
```

## Performance Impact

### Scenario: Store Changes

```
Change filter (doesn't affect total):

❌ useStore("cart"):
   Component A: Re-render  ✗
   Component B: Re-render  ✗
   Component C: Re-render  ✗
   Total: 3 unnecessary re-renders

✅ useSelector("cart", s => s.total):
   Component A: Skip       ✓
   Component B: Skip       ✓
   Component C: Skip       ✓
   Total: 0 unnecessary re-renders
```

## Real Component Examples

### Bad Practice
```typescript
function OrderSummary() {
  // Whole store - re-renders often
  const orders = useStore("orders");

  return (
    <div>
      <p>Total Items: {orders.items.length}</p>
      <p>Total Price: {
        orders.items.reduce((s, o) => s + o.price * o.qty, 0)
      }</p>
    </div>
  );
}
```

### Good Practice
```typescript
function OrderSummary() {
  // Each field has its own selector
  const itemCount = useSelector("orders", s => s.items.length);
  const totalPrice = useSelector("orders", s =>
    s.items.reduce((s, o) => s + o.price * o.qty, 0)
  );

  return (
    <div>
      <p>Total Items: {itemCount}</p>
      <p>Total Price: {totalPrice}</p>
    </div>
  );
}
```

### Better Practice (Extract Selectors)
```typescript
// Outside component
const selectItemCount = (state) => state.items.length;
const selectTotalPrice = (state) =>
  state.items.reduce((s, o) => s + o.price * o.qty, 0);

function OrderSummary() {
  const itemCount = useSelector("orders", selectItemCount);
  const totalPrice = useSelector("orders", selectTotalPrice);

  return (
    <div>
      <p>Total Items: {itemCount}</p>
      <p>Total Price: {totalPrice}</p>
    </div>
  );
}
```

## When to Use What

| Use This | When | Example |
|----------|------|---------|
| `useStore()` | Need whole store | `<CartOverview>` showing all fields |
| `useSelector()` | Need 1-2 fields | `<Price total={...}>` |
| `selectStore()` | Server-side subscribe | Middleware, utilities |

## Optimization Rules

1. **Extract selectors outside components**
   ```typescript
   // ✅ Good
   const selectTotal = s => s.total;
   function Component() {
     const total = useSelector("cart", selectTotal);
   }

   // ❌ Bad (recreates function each render)
   function Component() {
     const total = useSelector("cart", s => s.total);
   }
   ```

2. **One selector per value**
   ```typescript
   // ✅ Good
   const items = useSelector("cart", s => s.items);
   const total = useSelector("cart", s => s.total);

   // ❌ Bad (object recreated each change)
   const cartData = useSelector("cart", s => ({
     items: s.items,
     total: s.total
   }));
   ```

3. **Match selector to what matters**
   ```typescript
   // ✅ Good
   // Re-renders when completed count changes
   const completedCount = useSelector("todos", s =>
     s.items.filter(t => t.done).length
   );

   // ❌ Bad (re-renders when any property changes)
   const completedCount = useSelector("todos", s => s);
   ```

## Memoized Selectors (Advanced)

```typescript
import { createSelector } from "stroid/selectors";

// Memoized selector (result cached)
const selectCompletedTodos = createSelector(
  state => state.items,
  items => items.filter(item => item.done)
);

// Only recomputes if items reference changes
const done = useSelector("todos", selectCompletedTodos);
```

## Debugging Selectors

```typescript
// See what's selected
subscribeStore("cart", state => {
  console.log("Store changed:", state);
});

// See what selector returns
const total = useSelector("cart", state => {
  const result = state.total;
  console.log("Selector result:", result);
  return result;
});
```

## Best Practices Checklist

- ✓ Extract selector functions (don't create inline)
- ✓ Use `useSelector()` for single values
- ✓ Use `useStore()` only for complex components
- ✓ Name selectors clearly (`selectTotal`, not `get`)
- ✓ Test which changes cause re-renders
- ✓ Profile components with DevTools

## Next Steps

- **02-react-hooks** - Basic React integration
- **01-basics** - Core store operations
- **03-async-fetching** - Combined with async data

---

💡 **Performance Tip**: Selectors are your secret weapon for fast React apps! Use them liberally!
