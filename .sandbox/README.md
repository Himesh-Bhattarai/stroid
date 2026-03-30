# 🟣 Stroid Sandbox - Learn by Example

Welcome to the Stroid Sandbox! This directory contains **runnable, real-world examples** that demonstrate how to use Stroid for state management in your applications.

## 📚 What's Inside

Each example is self-contained and runnable. Start with the basics and progressively explore advanced features.

### Getting Started
- **[01-basics](./01-basics/)** - Core store operations (create, read, write, delete)
- **[02-react-hooks](./02-react-hooks/)** - Using Stroid with React components
- **[03-persistence](./03-persistence/)** - Persisting store data to localStorage

### Real-World Patterns
- **[04-async-fetching](./04-async-fetching/)** - Async data loading with caching
- **[05-tab-sync](./05-tab-sync/)** - Syncing state across browser tabs
- **[06-selectors](./06-selectors/)** - Efficient store subscriptions
- **[07-computed-values](./07-computed-values/)** - Derived state and calculations

### Advanced Topics
- **[08-devtools](./08-devtools/)** - Debugging with Stroid DevTools
- **[09-ssr-safety](./09-ssr-safety/)** - Server-side rendering isolation
- **[10-testing](./10-testing/)** - Testing patterns with Stroid stores

## 🚀 How to Use

### Option 1: Run Examples Directly (Node.js)
```bash
cd 01-basics
node --import tsx index.ts
```

### Option 2: Use in React App
Each React example can be copied into your app:
```bash
cp -r 02-react-hooks/* src/
```

### Option 3: Study the Code
Open any `index.ts` or `.tsx` file to see how it works. All examples are heavily commented.

## 🎯 Learning Path

1. **Start here**: `01-basics` - Understand core store operations
2. **Then**: `02-react-hooks` - Learn React integration
3. **Next**: `04-async-fetching` - Handle data loading
4. **Advanced**: Skip to any topic that interests you

## 💡 Example Structure

Each example folder contains:
- `index.ts` or `index.tsx` - The example code (heavily commented)
- `package.json` - Dependencies (if needed)
- `README.md` - Detailed explanation

## 🔗 Key Concepts

### Named Stores
Every store has a unique name. This is fundamental to Stroid:
```ts
createStore("cart", { items: [], total: 0 });
setStore("cart", "items", [1, 2, 3]);
const cart = getStore("cart");
```

### Optional Features
Features are activated per-store:
```ts
createStore("settings", { theme: "dark" }, {
  persist: true,      // Save to localStorage
  sync: true          // Sync across tabs
});
```

### Subscription Pattern
React components automatically re-render when store changes:
```tsx
function CartItem() {
  const cart = useStore("cart");  // Re-renders on change
  return <div>{cart.items.length}</div>;
}
```

## 📖 Full Documentation

For complete API reference, see the main [README.md](../README.md)

## ❓ Getting Help

- **Confused?** Read the comments in each example
- **Want more?** Check the main [IMPORT.md](../IMPORT.md) guide
- **Found an issue?** See [CONTRIBUTING.md](../CONTRIBUTING.md)

---

**🎓 Learning Tips:**
1. Run examples before reading the code
2. Modify values and see what changes
3. Use browser DevTools to inspect store state
4. Copy patterns into your own projects
