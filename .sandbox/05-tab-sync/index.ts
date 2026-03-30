/**
 * 🟣 Stroid Sandbox - Example 5: Tab Synchronization
 *
 * Demonstrates syncing store state across browser tabs/windows.
 * Features:
 * - installSync() - Enable sync feature
 * - sync: true option - Sync specific stores
 * - Real-time updates across tabs
 * - BroadcastChannel API
 */

import {
  createStore,
  setStore,
  getStore,
  clearAllStores,
  subscribeStore
} from "stroid";
import { installSync } from "stroid/sync";

console.log("════════════════════════════════════════════════════════════════");
console.log("🟣 Stroid Tab Synchronization Example");
console.log("════════════════════════════════════════════════════════════════\n");

// ═══════════════════════════════════════════════════════════════════════
// 1️⃣ Setup: Install sync feature
// ═══════════════════════════════════════════════════════════════════════

console.log("📡 Step 1: Install sync feature\n");

// Enable the sync feature (uses BroadcastChannel API)
installSync();

console.log("✅ Sync feature installed\n");
console.log("💡 How it works:");
console.log("   • Uses BroadcastChannel API (all modern browsers)");
console.log("   • Syncs stores across same-origin tabs/windows");
console.log("   • Real-time bidirectional sync\n");

// ═══════════════════════════════════════════════════════════════════════
// 2️⃣ Create stores WITH sync
// ═══════════════════════════════════════════════════════════════════════

console.log("────────────────────────────────────────────────────────────────");
console.log("🔧 Step 2: Create stores with sync: true\n");

clearAllStores();

// This store will be synced across tabs
createStore(
  "sharedCart",
  {
    items: [],
    total: 0,
    lastUpdated: new Date().toISOString()
  },
  { sync: true }  // ← Enable sync for this store
);

console.log("✅ Created 'sharedCart' (will be synced)\n");

// This store will NOT be synced
createStore(
  "localUI",
  {
    isModalOpen: false,
    selectedTab: "products",
    debugInfo: { viewedAt: new Date() }
  }
  // No sync option = local only
);

console.log("✅ Created 'localUI' (will NOT be synced)\n");

// ═══════════════════════════════════════════════════════════════════════
// 3️⃣ Demonstrate subscription across updates
// ═══════════════════════════════════════════════════════════════════════

console.log("────────────────────────────────────────────────────────────────");
console.log("📡 Step 3: Subscribe to changes\n");

let changeCount = 0;

const unsubscribeCart = subscribeStore("sharedCart", (state) => {
  changeCount++;
  console.log(`[Notification #${changeCount}] Cart updated:`, state);
});

console.log("✅ Subscription registered (will fire on any cart change)\n");

// ═══════════════════════════════════════════════════════════════════════
// 4️⃣ Make changes (simulate user actions in one tab)
// ═══════════════════════════════════════════════════════════════════════

console.log("────────────────────────────────────────────────────────────────");
console.log("🛒 Step 4: Simulate user actions\n");

console.log("User in Tab A adds items to cart...\n");

// Add first item - subscription fires
setStore("sharedCart", "items", [
  { id: 1, name: "Laptop", price: 999.99, qty: 1 }
]);
setStore("sharedCart", "total", 999.99);

// Add second item
setStore("sharedCart", "items", draft => {
  draft.push({ id: 2, name: "Mouse", price: 29.99, qty: 1 });
});
setStore("sharedCart", "total", 1029.98);

// Update timestamp
setStore("sharedCart", "lastUpdated", new Date().toISOString());

// ═══════════════════════════════════════════════════════════════════════
// 5️⃣ Show what other tabs would see
// ═══════════════════════════════════════════════════════════════════════

console.log("────────────────────────────────────────────────────────────────");
console.log("👀 Step 5: What other tabs see\n");

const currentCart = getStore("sharedCart");
console.log("Tab B (any other tab) would see:");
console.log(JSON.stringify(currentCart, null, 2));

console.log("\n💡 Key Point:");
console.log("   In a real browser, any open Tab B with same origin would");
console.log("   have received all the updates automatically!");
console.log("   (This demo runs in Node.js, so we simulate it)\n");

// ═══════════════════════════════════════════════════════════════════════
// 6️⃣ Real-world example: Collaborative shopping
// ═══════════════════════════════════════════════════════════════════════

console.log("────────────────────────────────────────────────────────────────");
console.log("🏪 Real-World: Collaborative Shopping\n");

clearAllStores();

// Shared across tabs - two people shopping together
createStore(
  "familyShoppingCart",
  {
    items: [
      { id: 101, name: "Milk", price: 3.99, qty: 2, addedBy: "Mom" },
      { id: 102, name: "Bread", price: 2.49, qty: 1, addedBy: "Dad" }
    ],
    notes: "Weekly groceries",
    lastModified: new Date().toISOString()
  },
  { sync: true }  // Both family members' tabs stay in sync
);

// Local preferences - not synced
createStore(
  "myPreferences",
  {
    viewMode: "grid",
    hidePrices: false,
    theme: "dark"
  }
  // Not synced - each person has their own
);

console.log("✅ Created shared 'familyShoppingCart' for collaboration");
console.log("✅ Created local 'myPreferences' (personal)\n");

console.log("Timeline of events:\n");

console.log("14:00 - Mom opens the page (Tab 1)");
console.log("14:05 - Dad opens the page in another tab (Tab 2)");
console.log("       → Dad's cart auto-syncs with Mom's cart\n");

console.log("14:10 - Mom adds 'Eggs' (Tab 1)");
// Simulate Mom adding eggs
let items = getStore("familyShoppingCart").items;
items = [...items, { id: 103, name: "Eggs", price: 4.99, qty: 1, addedBy: "Mom" }];
setStore("familyShoppingCart", "items", items);
setStore("familyShoppingCart", "lastModified", new Date().toISOString());

console.log("       → Dad's Tab 2 instantly shows eggs\n");

console.log("14:12 - Dad removes 'Milk' (Tab 2)");
// Simulate Dad removing milk
let updatedItems = getStore("familyShoppingCart").items
  .filter(item => item.id !== 101);
setStore("familyShoppingCart", "items", updatedItems);
setStore("familyShoppingCart", "lastModified", new Date().toISOString());

console.log("       → Mom's Tab 1 instantly sees milk removed\n");

console.log("14:15 - Both see the same cart:");
console.log(JSON.stringify(getStore("familyShoppingCart"), null, 2));

// ═══════════════════════════════════════════════════════════════════════
// 7️⃣ What doesn't sync
// ═══════════════════════════════════════════════════════════════════════

console.log("\n────────────────────────────────────────────────────────────────");
console.log("❌ What Doesn't Sync (and why)\n");

const localUI = getStore("localUI");
console.log("Local UI state (not synced):");
console.log(JSON.stringify(localUI, null, 2));

console.log("\n💡 Reason: Personal UI state");
console.log("   • Modal open/close state (personal preference)");
console.log("   • Selected tab (each person browses differently)");
console.log("   • Theme preference (each person's choice)");
console.log("   • Debug info (developer-only features)\n");

// ═══════════════════════════════════════════════════════════════════════
// 8️⃣ Best Practices
// ═══════════════════════════════════════════════════════════════════════

console.log("════════════════════════════════════════════════════════════════");
console.log("✅ BEST PRACTICES FOR SYNC");
console.log("════════════════════════════════════════════════════════════════\n");

const bestPractices = `
┌──────────────────────────────────────────────────────────────┐
│ What TO Sync (sync: true)                                    │
├──────────────────────────────────────────────────────────────┤
│ • Shopping carts (multiple people shopping)                  │
│ • Shared notes/documents (collaborative editing)             │
│ • Shared data updates (stock prices, inventory)              │
│ • Notifications (one tab should know about all)              │
│ • User activity status (online/away)                         │
│ • Form progress (fill form in Tab 1, continue in Tab 2)      │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ What NOT To Sync                                             │
├──────────────────────────────────────────────────────────────┤
│ • UI state (modal open, scroll position, selected item)      │
│ • Personal preferences (theme, language per person)          │
│ • DEBUG info (devtools data, profiling)                      │
│ • Large temporary data (file upload progress)                │
│ • Authentication tokens (use cookies instead)                │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Implementation Tips                                          │
├──────────────────────────────────────────────────────────────┤
│ ✓ Use installSync() once at app startup                      │
│ ✓ Add sync: true only to shared stores                       │
│ ✓ Works across same-origin tabs (same domain)                │
│ ✓ Uses BroadcastChannel API (modern browsers)                │
│ ✓ Real-time bidirectional sync                               │
│ ✓ No server needed (pure client-side)                        │
│ ✓ Perfect for multi-window collaborative apps                │
└──────────────────────────────────────────────────────────────┘
`;

console.log(bestPractices);

// ═══════════════════════════════════════════════════════════════════════
// Cleanup
// ═══════════════════════════════════════════════════════════════════════

unsubscribeCart();

console.log("════════════════════════════════════════════════════════════════");
console.log("🎓 To see this in action:");
console.log("   1. Open 2 browser tabs with your app");
console.log("   2. Add items in Tab 1 cart");
console.log("   3. Tab 2 cart updates in real-time!");
console.log("   4. Make changes in Tab 2, Tab 1 sees them!");
console.log("════════════════════════════════════════════════════════════════\n");
console.log("📖 Related examples:");
console.log("   • 04-persistence (save to localStorage)");
console.log("   • 01-basics (core store operations)");
console.log("════════════════════════════════════════════════════════════════\n");
