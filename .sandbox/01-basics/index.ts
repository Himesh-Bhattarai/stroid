/**
 * 🟣 Stroid Sandbox - Example 1: Core Store Operations
 *
 * This example demonstrates the fundamental operations you need to know:
 * - createStore    - Create a new store
 * - setStore       - Update store values
 * - getStore       - Read current store state
 * - hasStore       - Check if store exists
 * - subscribeStore - Listen for changes
 * - deleteStore    - Remove a store
 */

import {
  createStore,
  setStore,
  getStore,
  hasStore,
  subscribeStore,
  deleteStore,
  clearAllStores
} from "stroid";

// ═══════════════════════════════════════════════════════════════════════
// 1️⃣ CREATE: Define your store structure
// ═══════════════════════════════════════════════════════════════════════

// Create a cart store with initial state
createStore("cart", {
  items: [],
  total: 0,
  currency: "USD"
});

console.log("\n✅ 1. Store Created");
console.log("   Store: 'cart'");
console.log("   Initial:", getStore("cart"));

// ═══════════════════════════════════════════════════════════════════════
// 2️⃣ READ: Get current state
// ═══════════════════════════════════════════════════════════════════════

const currentCart = getStore("cart");
console.log("\n📖 2. Read Store");
console.log("   Current cart:", currentCart);

// ═══════════════════════════════════════════════════════════════════════
// 3️⃣ WRITE: Update store values using setStore
// ═══════════════════════════════════════════════════════════════════════

// Method 1: Set a simple value
setStore("cart", "total", 49.99);
console.log("\n✏️ 3. Write Store (Simple Value)");
console.log("   After setStore('cart', 'total', 49.99)");
console.log("   Current:", getStore("cart"));

// Method 2: Set nested objects (using immer draft pattern)
setStore("cart", "items", (draft) => {
  draft.push({
    id: "item-1",
    name: "Pizza",
    price: 15.99,
    quantity: 2
  });
});

console.log("\n✏️ 4. Write Store (Nested Update)");
console.log("   After adding pizza item");
console.log("   Current:", getStore("cart"));

// ═══════════════════════════════════════════════════════════════════════
// 4️⃣ SUBSCRIBE: Listen for changes
// ═══════════════════════════════════════════════════════════════════════

// Subscribe to all changes in the cart
const unsubscribe = subscribeStore("cart", (newState) => {
  console.log("\n🔔 [Subscription Triggered]", newState);
});

console.log("\n👂 5. Subscribe to Changes");
console.log("   Listener registered, making changes below...");

// This will trigger the subscription
setStore("cart", "total", 79.98);
console.log("   ↑ You should see the subscription message above");

// This also triggers the subscription
setStore("cart", "currency", "EUR");

// ═══════════════════════════════════════════════════════════════════════
// 5️⃣ CHECK: Verify store existence
// ═══════════════════════════════════════════════════════════════════════

console.log("\n❓ 6. Check Store Existence");
console.log("   hasStore('cart'):", hasStore("cart"));
console.log("   hasStore('checkout'):", hasStore("checkout"));

// ═══════════════════════════════════════════════════════════════════════
// 6️⃣ DELETE: Clean up (unsubscribe first!)
// ═══════════════════════════════════════════════════════════════════════

console.log("\n🗑️ 7. Cleanup");
console.log("   Unsubscribing listener...");
unsubscribe();

console.log("   Deleting store...");
deleteStore("cart");

console.log("   hasStore('cart') after delete:", hasStore("cart"));

// ═══════════════════════════════════════════════════════════════════════
// 🎯 Multiple Stores Example
// ═══════════════════════════════════════════════════════════════════════

console.log("\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
console.log("🎯 REAL-WORLD EXAMPLE: Food Delivery App");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

// Clear previous stores
clearAllStores();

// Create multiple stores for different concerns
createStore("user", {
  id: "user-123",
  name: "Alice Johnson",
  email: "alice@example.com",
  address: "123 Main St"
});

createStore("cart", {
  items: [],
  subtotal: 0,
  tax: 0,
  total: 0,
  estimatedDelivery: null
});

createStore("checkout", {
  step: 1,  // 1=cart, 2=delivery, 3=payment, 4=confirm
  paymentMethod: "card",
  promoCode: null
});

console.log("✅ 3 stores created: user, cart, checkout\n");

// Update cart with food items
setStore("cart", "items", [
  { name: "Margherita Pizza", price: 15.99, qty: 1 },
  { name: "Caesar Salad", price: 8.99, qty: 2 },
  { name: "Garlic Bread", price: 4.99, qty: 1 }
]);

setStore("cart", "subtotal", 38.96);
setStore("cart", "tax", 3.90);
setStore("cart", "total", 42.86);

console.log("📦 User:", getStore("user"));
console.log("\n🛒 Cart:", getStore("cart"));
console.log("\n💳 Checkout:", getStore("checkout"));

// Update checkout as user progresses
setStore("checkout", "step", 2);
setStore("checkout", "promoCode", "SAVE10");

console.log("\n✅ Checkout step advanced to delivery");
console.log("📊 Updated checkout:", getStore("checkout"));
  
// ═══════════════════════════════════════════════════════════════════════
// 💡 Key Takeaways
// ═══════════════════════════════════════════════════════════════════════

console.log("\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("💡 KEY CONCEPTS");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

console.log(`
✓ Every store has a NAME ("cart", "user", etc.)
✓ Stores hold STATE (objects with your app data)
✓ Use SETSTORE to update state (immutably)
✓ Use GETSTORE to read current state
✓ Use SUBSCRIBESTORE to react to changes
✓ Multiple stores work independently
✓ You can delete stores you don't need
`);

console.log("\n🎓 Next Steps:");
console.log("   Read: 02-react-hooks for React integration");
console.log("   Read: 03-persistence for persisting state");
console.log("   Read: 04-async-fetching for data loading\n");
