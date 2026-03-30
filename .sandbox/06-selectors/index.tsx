/**
 * 🟣 Stroid Sandbox - Example 6: Selectors & Optimized Subscriptions
 *
 * Demonstrates efficient store subscriptions using selectors.
 * Features:
 * - selectStore() - Subscribe to store changes with selector
 * - Prevent unnecessary re-renders
 * - Computed derived values
 * - Memoized selectors
 */

import React from "react";
import { createStore, setStore, getStore, clearAllStores } from "stroid";
import { useStore, useSelector } from "stroid/react";
import { selectStore, createSelector } from "stroid/selectors";

console.log("════════════════════════════════════════════════════════════════");
console.log("🟣 Stroid Selectors Example");
console.log("════════════════════════════════════════════════════════════════\n");

// ═══════════════════════════════════════════════════════════════════════
// Setup: Create a store with complex state
// ═══════════════════════════════════════════════════════════════════════

clearAllStores();

type Order = {
  id: string;
  product: string;
  price: number;
  quantity: number;
  status: "pending" | "shipped" | "delivered" | "cancelled";
  createdAt: string;
};

createStore("orders", {
  items: [
    { id: "1", product: "Laptop", price: 999, quantity: 1, status: "delivered", createdAt: "2024-01-15" },
    { id: "2", product: "Mouse", price: 29, quantity: 2, status: "shipped", createdAt: "2024-02-20" },
    { id: "3", product: "Keyboard", price: 79, quantity: 1, status: "pending", createdAt: "2024-03-10" },
    { id: "4", product: "Monitor", price: 299, quantity: 1, status: "cancelled", createdAt: "2024-02-28" }
  ] as Order[],
  filter: "all" as "all" | "pending" | "shipped" | "delivered" | "cancelled",
  sortBy: "date" as "date" | "price"
});

console.log("✅ Created 'orders' store with complex nested state\n");

// ═══════════════════════════════════════════════════════════════════════
// 1️⃣ Basic Selector - Select single field
// ═══════════════════════════════════════════════════════════════════════

console.log("────────────────────────────────────────────────────────────────");
console.log("1️⃣ Basic Selectors\n");

// Subscribe only to items
const subscribeToItems = selectStore("orders", state => state.items);
const unsubscribe1 = subscribeToItems(items => {
  console.log("[Selector 1] Items updated. Count:", items.length);
});

console.log("✅ Selector registered: watch items array\n");

// ═══════════════════════════════════════════════════════════════════════
// 2️⃣ Derived Selector - Calculate value from store
// ═══════════════════════════════════════════════════════════════════════

console.log("────────────────────────────────────────────────────────────────");
console.log("2️⃣ Derived Selectors (computed values)\n");

// Calculate total price
const selectTotalPrice = (state: any) => {
  return state.items.reduce((sum: number, order: Order) => {
    return sum + (order.price * order.quantity);
  }, 0);
};

const unsubscribe2 = selectStore("orders", selectTotalPrice)(total => {
  console.log("[Selector 2] Total price recalculated:", `$${total}`);
});

console.log("✅ Selector registered: compute total price\n");

// Count pending orders
const selectPendingCount = (state: any) => {
  return state.items.filter((o: Order) => o.status === "pending").length;
};

const unsubscribe3 = selectStore("orders", selectPendingCount)(count => {
  console.log("[Selector 3] Pending count updated:", count);
});

console.log("✅ Selector registered: count pending orders\n");

// ═══════════════════════════════════════════════════════════════════════
// 3️⃣ Complex Selector - Filter & Transform
// ═══════════════════════════════════════════════════════════════════════

console.log("────────────────────────────────────────────────────────────────");
console.log("3️⃣ Complex Selectors (filter + transform)\n");

const selectDeliveredOrders = (state: any) => {
  return state.items
    .filter((o: Order) => o.status === "delivered")
    .map((o: Order) => ({ id: o.id, product: o.product, price: o.price }));
};

const unsubscribe4 = selectStore("orders", selectDeliveredOrders)(orders => {
  console.log("[Selector 4] Delivered orders:", orders.length, "items");
});

console.log("✅ Selector registered: filter & map delivered orders\n");

// ═══════════════════════════════════════════════════════════════════════
// 4️⃣ Make changes and see selectors fire
// ═══════════════════════════════════════════════════════════════════════

console.log("────────────────────────────────────────────────────────────────");
console.log("🔄 Making changes - watch selectors fire\n");

console.log("Change 1: Set filter to 'pending'\n");
setStore("orders", "filter", "pending");
console.log("→ Only filter changed, items/calculations same\n");

console.log("Change 2: Set sort to 'price'\n");
setStore("orders", "sortBy", "price");
console.log("→ Still different from items\n");

console.log("Change 3: Add new order\n");
setStore("orders", "items", draft => {
  draft.push({
    id: "5",
    product: "Headphones",
    price: 149,
    quantity: 1,
    status: "pending",
    createdAt: "2024-03-20"
  });
});
console.log("→ Items changed! All item-based selectors fire\n");

console.log("Change 4: Update order status\n");
setStore("orders", "items", draft => {
  const order = draft.find(o => o.id === "3");
  if (order) order.status = "delivered";
});
console.log("→ Items changed! Pending count, delivered list, and total update\n");

// ═══════════════════════════════════════════════════════════════════════
// 5️⃣ React Example: Efficient Components
// ═══════════════════════════════════════════════════════════════════════

console.log("────────────────────────────────────────────────────────────────");
console.log("⚛️ React Components with Selectors\n");

/**
 * ❌ BAD: Re-renders on ANY store change
 * (even when only filter or sortBy changes)
 */
function OrdersSummaryBad(): React.ReactElement {
  const orders = useStore("orders");  // ← Whole store subscription

  return (
    <div>
      <p>Items: {orders.items.length}</p>
      <p>Total: ${orders.items.reduce((s, o: Order) => s + o.price * o.quantity, 0)}</p>
    </div>
  );
}

/**
 * ✅ GOOD: Re-renders ONLY when totalPrice changes
 * (ignores filter/sortBy/other changes)
 */
function OrdersSummarySelectorBad(): React.ReactElement {
  const totalPrice = useSelector("orders", state =>
    state.items.reduce((s, o: Order) => s + o.price * o.quantity, 0)
  );

  return (
    <div>
      <p>Total: ${totalPrice}</p>
    </div>
  );
}

/**
 * ✅ EVEN BETTER: Use derived selectors
 */
function OrdersSummarySelectorGood(): React.ReactElement {
  const totalPrice = useSelector("orders", selectTotalPrice);
  const pendingCount = useSelector("orders", selectPendingCount);
  const itemCount = useSelector("orders", state => state.items.length);

  return (
    <div>
      <p>Items: {itemCount}</p>
      <p>Pending: {pendingCount}</p>
      <p>Total: ${totalPrice}</p>
    </div>
  );
}

console.log("✅ Component examples:");
console.log("   BadComponent: Re-renders often (whole store)");
console.log("   GoodComponent: Re-renders rarely (specific selectors)\n");

// ═══════════════════════════════════════════════════════════════════════
// 6️⃣ Performance Comparison
// ═══════════════════════════════════════════════════════════════════════

console.log("────────────────────────────────────────────────────────────────");
console.log("📊 Performance Comparison\n");

console.log(`
┌──────────────────────────────────────────────────────────────┐
│ useStore("orders") - Whole Store Subscription               │
├──────────────────────────────────────────────────────────────┤
│ Scenario                          │ Re-renders               │
├───────────────────────────────────┼────────────────────────┤
│ Change filter field               │ ✅ Unnecessary!        │
│ Change sortBy field               │ ✅ Unnecessary!        │
│ Change any item                   │ ✅ Necessary           │
│ Add new order                     │ ✅ Necessary           │
│ Efficiency                        │ ⚠️  Many re-renders    │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ useSelector("orders", state => state.items.length)          │
├──────────────────────────────────────────────────────────────┤
│ Scenario                          │ Re-renders               │
├───────────────────────────────────┼────────────────────────┤
│ Change filter field               │ ❌ Skip!               │
│ Change sortBy field               │ ❌ Skip!               │
│ Change any item                   │ ✅ Necessary           │
│ Add new order                     │ ✅ Necessary           │
│ Efficiency                        │ ✅ Minimal re-renders  │
└──────────────────────────────────────────────────────────────┘
`);

// ═══════════════════════════════════════════════════════════════════════
// Cleanup
// ═══════════════════════════════════════════════════════════════════════

unsubscribe1();
unsubscribe2();
unsubscribe3();
unsubscribe4();

console.log("════════════════════════════════════════════════════════════════");
console.log("✅ BEST PRACTICES WITH SELECTORS");
console.log("════════════════════════════════════════════════════════════════\n");

const bestPractices = `
┌──────────────────────────────────────────────────────────────┐
│ When to Use Selectors                                        │
├──────────────────────────────────────────────────────────────┤
│ ✓ Get single field (name, status, count)                    │
│ ✓ Derive computed value (total, average, filtered list)     │
│ ✓ Need to prevent unnecessary re-renders                    │
│ ✓ Building performance-critical components                  │
│ ✓ Complex calculations from store state                     │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Selector Patterns                                            │
├──────────────────────────────────────────────────────────────┤
│ 1. Identity selector (return field as-is)                    │
│    const selectName = s => s.name;                           │
│                                                              │
│ 2. Computed selector (transform data)                        │
│    const selectTotal = s => s.items.reduce(...);            │
│                                                              │
│ 3. Filter selector (extract matching items)                 │
│    const selectActive = s => s.items.filter(i => i.active); │
│                                                              │
│ 4. Map selector (transform items)                           │
│    const selectNames = s => s.items.map(i => i.name);       │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Performance Tips                                             │
├──────────────────────────────────────────────────────────────┤
│ • Use useSelector() instead of useStore() when possible      │
│ • Memoize selector functions (don't create inline)           │
│ • Extract selectors to separate constants                    │
│ • One selector per derived value                             │
│ • Test: see which changes cause re-renders                   │
└──────────────────────────────────────────────────────────────┘
`;

console.log(bestPractices);

console.log("════════════════════════════════════════════════════════════════");
console.log("🎓 Next Steps:");
console.log("   • Try: 02-react-hooks (basic React integration)");
console.log("   • Try: 01-basics (core store operations)");
console.log("════════════════════════════════════════════════════════════════\n");

export {
  OrdersSummaryBad,
  OrdersSummarySelectorBad,
  OrdersSummarySelectorGood,
  selectTotalPrice,
  selectPendingCount,
  selectDeliveredOrders
};
