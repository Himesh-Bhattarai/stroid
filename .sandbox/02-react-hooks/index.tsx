/**
 * 🟣 Stroid Sandbox - Example 2: React Hooks Integration
 *
 * Shows how to use Stroid stores in React components.
 * Demonstrates:
 * - useStore() - Subscribe to entire store
 * - useSelector() - Subscribe to specific fields
 * - Automatic re-renders on store changes
 */

import React, { useState } from "react";
import { createStore, setStore, getStore, deleteStore, clearAllStores } from "stroid";
import { useStore, useSelector } from "stroid/react";

// ═══════════════════════════════════════════════════════════════════════
// Setup: Create stores for our app
// ═══════════════════════════════════════════════════════════════════════

clearAllStores();

// Create a cart store
createStore("cart", {
  items: [
    { id: 1, name: "Laptop", price: 999.99, quantity: 1 },
    { id: 2, name: "Mouse", price: 29.99, quantity: 2 }
  ],
  total: 1059.97
});

// Create a user store
createStore("user", {
  id: "user-123",
  name: "John Doe",
  email: "john@example.com",
  memberSince: "2024-01-15"
});

// ═══════════════════════════════════════════════════════════════════════
// 1️⃣ useStore() - Get entire store (re-renders on any change)
// ═══════════════════════════════════════════════════════════════════════

type CartState = {
  items: Array<{ id: number; name: string; price: number; quantity: number }>;
  total: number;
};

function CartSummary(): React.ReactElement {
  // This hook subscribes to the entire "cart" store
  // Component re-renders whenever ANY field in cart changes
  const cart = useStore<CartState>("cart");

  return (
    <div className="border p-4 rounded">
      <h2>🛒 Cart Summary</h2>
      <p>Items in cart: {cart.items.length}</p>
      <p>Total: ${cart.total.toFixed(2)}</p>

      <div className="mt-2">
        <h3>Items:</h3>
        <ul>
          {cart.items.map((item) => (
            <li key={item.id}>
              {item.name} × {item.quantity} = ${(item.price * item.quantity).toFixed(2)}
            </li>
          ))}
        </ul>
      </div>

      <details className="mt-3 text-xs text-gray-500">
        <summary>Raw state</summary>
        <pre>{JSON.stringify(cart, null, 2)}</pre>
      </details>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 2️⃣ useSelector() - Get specific field (optimized re-renders)
// ═══════════════════════════════════════════════════════════════════════

function CartTotal(): React.ReactElement {
  // This hook only re-renders when the "total" field changes
  // More efficient than useStore() when you only need one field
  const total = useSelector("cart", (state: CartState) => state.total);

  return (
    <div className="bg-green-50 p-3 rounded">
      <h3>💰 Your Total</h3>
      <p className="text-2xl font-bold">${total.toFixed(2)}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 3️⃣ useSelector() with multiple fields
// ═══════════════════════════════════════════════════════════════════════

function CartItemCount(): React.ReactElement {
  // Select multiple fields in a single subscription
  const itemCount = useSelector("cart", (state: CartState) =>
    state.items.reduce((sum, item) => sum + item.quantity, 0)
  );

  return (
    <div className="bg-blue-50 p-3 rounded">
      <h3>📦 Item Count</h3>
      <p className="text-lg">{itemCount} items total</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 4️⃣ User Profile Component
// ═══════════════════════════════════════════════════════════════════════

type UserState = {
  id: string;
  name: string;
  email: string;
  memberSince: string;
};

function UserProfile(): React.ReactElement {
  const user = useStore<UserState>("user");
  const memberName = useSelector("user", (state: UserState) => state.name);

  return (
    <div className="border p-4 rounded">
      <h2>👤 User Profile</h2>
      <p><strong>Name:</strong> {user.name}</p>
      <p><strong>Email:</strong> {user.email}</p>
      <p><strong>Member since:</strong> {user.memberSince}</p>

      <div className="mt-3 text-sm text-gray-600">
        Name via selector: <strong>{memberName}</strong>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 5️⃣ Interactive Component with State Updates
// ═══════════════════════════════════════════════════════════════════════

function AddToCartButton(): React.ReactElement {
  const [newItem, setNewItem] = useState("");

  const handleAddItem = () => {
    if (!newItem.trim()) return;

    // Get current cart
    const currentCart = getStore<CartState>("cart");

    // Add new item
    const updatedItems = [...currentCart.items, {
      id: currentCart.items.length + 1,
      name: newItem,
      price: 49.99,
      quantity: 1
    }];

    // Update store
    setStore("cart", "items", updatedItems);
    setStore("cart", "total", updatedItems.reduce((sum, item) => sum + item.price * item.quantity, 0));

    setNewItem("");
  };

  return (
    <div className="border p-4 rounded">
      <h3>➕ Add Item</h3>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Item name"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && handleAddItem()}
          className="border px-2 py-1 flex-1"
        />
        <button
          onClick={handleAddItem}
          className="bg-blue-500 text-white px-4 py-1 rounded"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 6️⃣ Main App Component
// ═══════════════════════════════════════════════════════════════════════

function App(): React.ReactElement {
  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-3xl font-bold">🟣 Stroid React Example</h1>

      <div className="bg-yellow-50 p-3 rounded">
        <p className="text-sm">
          💡 <strong>Tip:</strong> Try adding items or updating the cart.
          All components re-render automatically!
        </p>
      </div>

      <UserProfile />

      <CartSummary />

      <div className="grid grid-cols-2 gap-4">
        <CartTotal />
        <CartItemCount />
      </div>

      <AddToCartButton />

      <div className="bg-gray-100 p-3 rounded text-sm">
        <h3 className="font-bold mb-2">📌 How This Works:</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><code>useStore("cart")</code> - Re-renders on ANY change</li>
          <li><code>useSelector("cart", selector)</code> - Re-renders ONLY if selector result changes</li>
          <li><code>setStore()</code> - Updates state, triggers all subscribers</li>
          <li><code>getStore()</code> - Gets current state (doesn't subscribe)</li>
        </ul>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Export for use in your React app
// ═══════════════════════════════════════════════════════════════════════

export {
  App,
  CartSummary,
  CartTotal,
  CartItemCount,
  UserProfile,
  AddToCartButton
};

// ═══════════════════════════════════════════════════════════════════════
// 💡 EXPLANATION: When to Use What
// ═══════════════════════════════════════════════════════════════════════

/*
┌─────────────────────────────────────────────────────────────────────┐
│ useStore() vs useSelector()                                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ useStore("cart")                                                   │
│ └─ Re-renders when ANY field changes                              │
│ └─ Use when you need the whole state                              │
│ └─ Example: Display entire cart details                           │
│                                                                     │
│ useSelector("cart", state => state.total)                         │
│ └─ Re-renders ONLY when selected value changes                    │
│ └─ More efficient (fewer re-renders)                              │
│ └─ Use when you only need specific fields                         │
│ └─ Example: Display only the total price                          │
│                                                                     │
│ Best Practice:                                                      │
│ ✓ Use useSelector() for single fields (prices, counts, names)     │
│ ✓ Use useStore() when you really need everything                  │
│ ✓ Selectors prevent unnecessary re-renders = better performance   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
*/

/*
┌─────────────────────────────────────────────────────────────────────┐
│ Reading vs Writing                                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Reading:                                                            │
│ - useStore() or useSelector() for React subscriptions             │
│ - getStore() for one-time reads (doesn't subscribe)               │
│                                                                     │
│ Writing:                                                            │
│ - setStore(name, path, value) to update state                     │
│ - Can update whole object or nested fields                        │
│ - Works from anywhere (components, utils, API handlers)           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
*/

/*
🎯 KEY TAKEAWAYS:
  1. useStore() subscribes to entire store
  2. useSelector() subscribes to specific derived value
  3. Both cause re-renders on changes
  4. setStore() updates state from anywhere
  5. getStore() reads state without subscribing
  6. Multiple components can use same store independently
*/

// Run this as React component in your app:
// import { App } from './02-react-hooks/index'
// export default App
