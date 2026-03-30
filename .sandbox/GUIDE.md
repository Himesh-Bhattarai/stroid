# 🎓 Complete Sandbox Guide

Master Stroid state management with runnable examples and comprehensive explanations.

## 📚 What is This?

The `.sandbox` directory contains **production-ready**, **fully-commented examples** demonstrating every feature of Stroid. Each example is:

- ✅ **Runnable** - Can be executed immediately
- ✅ **Self-contained** - Works independently
- ✅ **Documented** - Heavy comments explaining each line
- ✅ **Real-world** - Shows actual use cases
- ✅ **Progressive** - Builds on previous concepts

## 🚀 Quick Start (2 minutes)

### Step 1: Read the Overview
Start here: [QUICK_START.md](./QUICK_START.md)

### Step 2: Run Your First Example
```bash
cd .sandbox/01-basics
node --import tsx index.ts
```

### Step 3: Explore Next
Pick any example that interests you!

## 📖 Learning Path

Follow this order to build understanding progressively:

### 🟢 Beginner (30 minutes)
Start with fundamentals:

1. **01-basics** - Core store operations
2. Read: [QUICK_START.md](./QUICK_START.md)
3. Understand: Named stores, read, write, subscribe

### 🟡 Intermediate (1 hour)
Build with React:

4. **02-react-hooks** - React integration
5. **03-async-fetching** - Load data from APIs
6. **04-persistence** - Save to localStorage

### 🟠 Advanced (1+ hour)
Optimize and scale:

7. **05-tab-sync** - Multi-tab synchronization
8. **06-selectors** - Performance optimization
9. Combine all features into your app

## 📂 Example Structure

Each example folder contains:

```
01-basics/
├── index.ts              ← The runnable code (start here!)
├── README.md            ← How to run & what you'll learn
└── package.json         ← If needed (usually uses root deps)
```

## 🎯 What Each Example Teaches

| Example | Focus | Key Concepts | Time |
|---------|-------|--------------|------|
| **01-basics** | Foundation | create/read/write/subscribe | 15 min |
| **02-react-hooks** | React integration | useStore/useSelector | 20 min |
| **03-async-fetching** | Data loading | fetchStore/caching | 25 min |
| **04-persistence** | Storage | localStorage/persist | 15 min |
| **05-tab-sync** | Collaboration | BroadcastChannel/sync | 20 min |
| **06-selectors** | Performance | Optimization/memoization | 20 min |

## 🏃 How to Run Examples

### Method 1: Node.js Script (TypeScript)
```bash
cd .sandbox/01-basics
node --import tsx index.ts
```

**Requirements**: Node.js 18+

### Method 2: React App
```bash
# Copy component to your React project
cp .sandbox/02-react-hooks/index.tsx src/

# Import in your app
import { App } from "./App";
export default App;
```

### Method 3: Study Code
Open any `index.ts`/`index.tsx` file and read the comments!

## 💡 Example Scenarios

### Scenario 1: Building a Todo App
Run: `01-basics` → `02-react-hooks` → `04-persistence`

```typescript
import { createStore, setStore } from "stroid";
import { useStore } from "stroid/react";

createStore("todos", { items: [] }, { persist: true });

function TodoApp() {
  const todos = useStore("todos");
  // ... build UI
}
```

### Scenario 2: Multi-Person Shopping Cart
Run: `01-basics` → `03-async-fetching` → `05-tab-sync`

```typescript
import { installSync } from "stroid/sync";

installSync();
createStore("cart", {...}, { sync: true });

// Multiple tabs stay in sync automatically!
```

### Scenario 3: Large-Scale App
Run: All examples in order, then: `06-selectors`

Use optimized selectors for large stores with many components.

## 🔧 Setting Up Your Environment

### Global Setup (Optional)
```bash
# Install tsx globally for easier running
npm install -g tsx

# Then run:
cd .sandbox/01-basics
tsx index.ts  # Shorter!
```

### Project Setup
```bash
# Install Stroid in your project
npm install stroid

# Copy examples as reference
cp -r .sandbox/01-basics ./examples/
```

## 📊 Feature Matrix

Which examples use which features:

```
                  01  02  03  04  05  06
createStore       ✓   ✓   ✓   ✓   ✓   ✓
setStore/getStore ✓   ✓   ✓   ✓   ✓   ✓
useStore          -   ✓   ✓   -   -   ✓
useSelector       -   ✓   ✓   -   -   ✓
fetchStore        -   -   ✓   -   -   -
persist           -   -   -   ✓   ✓   -
sync              -   -   -   -   ✓   -
selectStore       -   -   -   -   -   ✓
```

## 🎓 Learning Tips

1. **Run then read**: Execute before reading code
2. **Modify and experiment**: Change values, see what happens
3. **Read comments**: Every line is explained
4. **Use DevTools**: Browser DevTools for React examples
5. **Test performance**: Use React Profiler to see re-renders
6. **Build small**: Create your own store after each example

## 🚨 Common Mistakes

### Mistake 1: Modifying state directly
```typescript
// ❌ DON'T
const cart = getStore("cart");
cart.total = 100;  // Doesn't work!

// ✅ DO
setStore("cart", "total", 100);
```

### Mistake 2: Not using hooks in React
```typescript
// ❌ DON'T
function Component() {
  const data = getStore("cart");  // Won't re-render!
}

// ✅ DO
function Component() {
  const data = useStore("cart");  // Will re-render!
}
```

### Mistake 3: Forgetting to install features
```typescript
// ❌ DON'T
createStore("cart", {}, { persist: true });  // Won't persist!

// ✅ DO
import { installPersist } from "stroid/persist";
installPersist();
createStore("cart", {}, { persist: true });
```

### Mistake 4: Using whole store when you need one field
```typescript
// ❌ Causes extra re-renders
const cart = useStore("cart");
const total = cart.total;

// ✅ More efficient
const total = useSelector("cart", s => s.total);
```

## 🔗 Connecting Examples

Chain examples to build complex apps:

```
01-basics (foundation)
    ↓
02-react-hooks (UI)
    ↓
03-async-fetching (data)
    ↓
04-persistence (remember state)
    ↓
05-tab-sync (multi-window)
    ↓
06-selectors (scale up)
    ↓
YOUR APP! 🚀
```

## 📋 Checklist: Before You Build

- [ ] Read `QUICK_START.md`
- [ ] Run `01-basics`
- [ ] Understand `createStore`/`setStore`/`getStore`
- [ ] Run `02-react-hooks`
- [ ] Understand `useStore`/`useSelector`
- [ ] Pick a feature that interests you
- [ ] Run that example
- [ ] Modify the code
- [ ] Build your own

## 🎯 Real-World Examples

See how pros use Stroid:

### E-Commerce Example
```
Features: cart (persist), products (async), filters (selectors)
Examples: 01, 03, 04, 06
```

### Collaborative App
```
Features: shared state (sync), server updates (async)
Examples: 01, 03, 05
```

### User Dashboard
```
Features: user prefs (persist), notifications (sync), analytics (async)
Examples: 01, 02, 03, 04, 05
```

## ⚡ Performance Notes

Stroid is optimized for:
- ✅ Frequent updates (thousands/sec)
- ✅ Large stores (100k+ items)
- ✅ Minimal re-renders (selectors)
- ✅ Zero memory leaks (cleanup)
- ✅ Fast serialization (persistence)

See `06-selectors` for performance optimization patterns.

## 🤝 Getting Help

**Stuck?**
1. Check the README in that example's folder
2. Read the comments in the code
3. Check `QUICK_START.md`
4. Review main `README.md`

**Want to know more?**
1. Read `IMPORT.md` for detailed API guide
2. Check main `README.md` for full reference
3. Look at actual tests in `/tests` folder

## 📕 Your Next Steps

1. Start with: [QUICK_START.md](./QUICK_START.md)
2. Run: `01-basics` example
3. Build: Your first store!

---

## Quick Links

- 🔗 [Main README](../README.md)
- 📖 [IMPORT.md Guide](../IMPORT.md)
- ⚡ [QUICK_START](./QUICK_START.md)
- 🔍 [01-basics](./01-basics/)
- ⚛️ [02-react-hooks](./02-react-hooks/)
- 📡 [03-async-fetching](./03-async-fetching/)
- 💾 [04-persistence](./04-persistence/)
- 🔄 [05-tab-sync](./05-tab-sync/)
- 🎯 [06-selectors](./06-selectors/)

---

**🎉 Time to learn Stroid! Start with [01-basics](./01-basics/)**
