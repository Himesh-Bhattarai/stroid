# Example 2: React Hooks Integration

Learn how to use Stroid stores in React components with automatic re-renders.

## What You'll Learn

- ✅ **useStore()** - Subscribe to entire store
- ✅ **useSelector()** - Subscribe to specific fields (optimized)
- ✅ **Automatic re-renders** - Components update when store changes
- ✅ **Performance patterns** - When to use what hook

## Run This Example

### In Your React App
```bash
# Copy the component into your project
cp index.tsx src/

# Import in your app
import { App } from "./App";

export default App;
```

### View the Code
Open `index.tsx` to see:
- Full React component examples
- useStore() vs useSelector() comparison
- Interactive components with state updates

## What It Does

The example shows 5 React components:

1. **CartSummary** - Display entire cart (useStore)
2. **CartTotal** - Show only price total (useSelector)
3. **CartItemCount** - Calculate total items (useSelector)
4. **UserProfile** - Display user data (useStore + useSelector)
5. **AddToCartButton** - Update state from component

## Key Patterns

### Use useStore() When:
```typescript
// Need ALL store fields
const cart = useStore("cart");
// Re-renders when items OR total OR anything changes

return (
  <div>
    <p>{cart.items.length} items</p>
    <p>${cart.total}</p>
  </div>
);
```

### Use useSelector() When:
```typescript
// Need SPECIFIC field
const total = useSelector("cart", state => state.total);
// Re-renders ONLY when total changes

return <p>${total}</p>;
```

## Performance Comparison

| Hook | Re-renders on | Best For |
|------|---------------|----------|
| `useStore()` | Any field change | Simple components needing whole state |
| `useSelector()` | Selector result change | Complex apps where performance matters |

## Real Component Example

```typescript
// ✅ Good: Only re-renders when total changes
function PriceDisplay() {
  const total = useSelector("cart", s => s.total);
  return <div className="price">${total}</div>;
}

// ❌ Bad: Re-renders when items OR total change
function PriceDisplay() {
  const cart = useStore("cart");
  return <div className="price">${cart.total}</div>;
}
```

## Next Steps

Try these:
1. Add new fields to components
2. Create more selectors
3. Try **03-async-fetching** - Load remote data
4. Try **04-persistence** - Save between sessions

## Troubleshooting

**Q: Component not re-rendering?**
A: Make sure you're using `useStore()` or `useSelector()`, not `getStore()`

**Q: Too many re-renders?**
A: Use `useSelector()` instead of `useStore()`

**Q: Type errors?**
A: Use generics: `useStore<CartType>("cart")`

---

💡 **Pro Tip**: Browser DevTools React Profiler shows which components re-render. Use it to optimize!
