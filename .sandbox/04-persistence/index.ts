/**
 * 🟣 Stroid Sandbox - Example 4: Persistence
 *
 * Demonstrates saving store state to localStorage and restoring it.
 * Features:
 * - installPersist() - Enable persistence feature
 * - persist: true option - Save specific stores
 * - Auto-loading from storage
 * - Manual save/load
 */

import {
  createStore,
  setStore,
  getStore,
  clearAllStores,
  configureStroid
} from "stroid";
import { installPersist } from "stroid/persist";

console.log("════════════════════════════════════════════════════════════════");
console.log("🟣 Stroid Persistence Example");
console.log("════════════════════════════════════════════════════════════════\n");

// ═══════════════════════════════════════════════════════════════════════
// 1️⃣ Setup: Install persistence feature
// ═══════════════════════════════════════════════════════════════════════

console.log("📦 Step 1: Install persistence feature\n");

// In a real app, do this once at app startup:
configureStroid({
  // Optional configuration
});

installPersist();

console.log("✅ Persist feature installed\n");

// ═══════════════════════════════════════════════════════════════════════
// 2️⃣ Create stores WITH persistence
// ═══════════════════════════════════════════════════════════════════════

console.log("────────────────────────────────────────────────────────────────");
console.log("🔧 Step 2: Create stores with persist: true\n");

clearAllStores();

// This store will be persisted automatically
createStore(
  "userPreferences",
  {
    theme: "dark",
    language: "en",
    notifications: true,
    fontSize: 14
  },
  { persist: true }  // ← Enable persistence for this store
);

console.log("✅ Created 'userPreferences' (will be persisted)\n");

// This store will NOT be persisted
createStore(
  "sessionData",
  {
    currentPage: 1,
    searchQuery: "",
    lastAction: null
  }
  // No persist option = not persisted
);

console.log("✅ Created 'sessionData' (will NOT be persisted)\n");

// ═══════════════════════════════════════════════════════════════════════
// 3️⃣ Modify stores
// ═══════════════════════════════════════════════════════════════════════

console.log("────────────────────────────────────────────────────────────────");
console.log("✏️ Step 3: Update stores\n");

console.log("Current userPreferences:", getStore("userPreferences"));
console.log("Current sessionData:", getStore("sessionData"));

// Update persisted store
setStore("userPreferences", "theme", "light");
setStore("userPreferences", "fontSize", 16);

console.log("\n✅ Updated preferences:");
console.log("   theme: dark ➜ light");
console.log("   fontSize: 14 ➜ 16");

// Update non-persisted store
setStore("sessionData", "currentPage", 5);
setStore("sessionData", "searchQuery", "stroid tutorial");

console.log("\n✅ Updated session data:");
console.log("   currentPage: 1 ➜ 5");
console.log("   searchQuery: '' ➜ 'stroid tutorial'");

// ═══════════════════════════════════════════════════════════════════════
// 4️⃣ Check localStorage (if in browser)
// ═══════════════════════════════════════════════════════════════════════

console.log("\n────────────────────────────────────────────────────────────────");
console.log("💾 Step 4: Check localStorage\n");

if (typeof localStorage !== "undefined") {
  const persistedUserPrefs = localStorage.getItem("stroid:userPreferences");
  const persistedSession = localStorage.getItem("stroid:sessionData");

  console.log("✅ Persisted in localStorage:");
  console.log("   stroid:userPreferences =", persistedUserPrefs);
  console.log("   stroid:sessionData =", persistedSession);

  console.log("\n💡 Notice:");
  console.log("   • userPreferences WAS saved (persist: true)");
  console.log("   • sessionData was NOT saved (no persist option)");
} else {
  console.log("ℹ️ localStorage not available (Node.js environment)");
  console.log("   This example works in browsers!\n");
}

// ═══════════════════════════════════════════════════════════════════════
// 5️⃣ Simulate page reload (new session)
// ═══════════════════════════════════════════════════════════════════════

console.log("\n────────────────────────────────────────────────────────────────");
console.log("🔄 Step 5: Simulate Page Reload\n");

console.log("Clearing stores...");
clearAllStores();

console.log("After clear:");
console.log("  userPreferences:", getStore("userPreferences"));
console.log("  sessionData:", getStore("sessionData"));

// Re-create stores (simulating app restart)
createStore(
  "userPreferences",
  {
    theme: "dark",
    language: "en",
    notifications: true,
    fontSize: 14
  },
  { persist: true }  // Will auto-restore from storage!
);

createStore(
  "sessionData",
  {
    currentPage: 1,
    searchQuery: "",
    lastAction: null
  }
);

console.log("\n✅ Stores recreated (persistence auto-restores):");
console.log("  userPreferences:", getStore("userPreferences"));
console.log("  sessionData:", getStore("sessionData"));

console.log("\n💡 Notice:");
console.log("   • userPreferences restored: light theme, fontSize 16 ✅");
console.log("   • sessionData reset to defaults ❌");
console.log("   • This is the key value of persist: true!");

// ═══════════════════════════════════════════════════════════════════════
// 6️⃣ Real-world example: Settings App
// ═══════════════════════════════════════════════════════════════════════

console.log("\n────────────────────────────────────────────────────────────────");
console.log("🏢 Real-World Example: User Settings App\n");

clearAllStores();

// User settings that should survive page reloads
createStore(
  "settings",
  {
    appearance: {
      theme: "dark",
      accentColor: "#5b21b6",
      compactMode: false
    },
    privacy: {
      shareProfile: true,
      showOnlineStatus: true,
      allowMessages: true
    },
    notifications: {
      email: {
        marketing: false,
        updates: true,
        social: false
      },
      push: true,
      desktop: true
    }
  },
  { persist: true }
);

// Temporary session data
createStore(
  "appState",
  {
    isLoading: false,
    currentView: "dashboard",
    sidebarOpen: true,
    selectedMenuId: null
  }
  // Not persisted - resets on each session
);

console.log("✅ Created 'settings' (persisted) and 'appState' (temporary)\n");

// User changes some settings
setStore("settings", "appearance", draft => {
  draft.theme = "light";
  draft.accentColor = "#0284c7";
});

setStore("settings", "notifications", draft => {
  draft.email.marketing = true;
  draft.push = false;
});

console.log("✅ User updated settings");
console.log("   Theme: dark ➜ light");
console.log("   Accent: purple ➜ blue");
console.log("   Marketing emails: off ➜ on");
console.log("   Push notifications: on ➜ off\n");

console.log("📊 Final settings:", getStore("settings"));

// ═══════════════════════════════════════════════════════════════════════
// 7️⃣ Best Practices
// ═══════════════════════════════════════════════════════════════════════

console.log("\n════════════════════════════════════════════════════════════════");
console.log("✅ BEST PRACTICES FOR PERSISTENCE");
console.log("════════════════════════════════════════════════════════════════\n");

const bestPractices = `
┌─────────────────────────────────────────────────────────────┐
│ What TO Persist (persist: true)                             │
├─────────────────────────────────────────────────────────────┤
│ • User preferences (theme, language, font size)             │
│ • Settings (notifications, privacy, account options)        │
│ • Form drafts (unsaved form data)                           │
│ • User choices (filters, sort order, view preferences)      │
│ • Non-sensitive user data                                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ What NOT To Persist                                         │
├─────────────────────────────────────────────────────────────┤
│ • Auth tokens (use HttpOnly cookies instead)                │
│ • Sensitive user data (passwords, SSN, etc.)                │
│ • Temporary UI state (loading spinners, modal open/close)   │
│ • API responses (cache them differently)                    │
│ • Session-specific data (current page, search results)      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Implementation Checklist                                    │
├─────────────────────────────────────────────────────────────┤
│ ✓ Install persist: installPersist()                         │
│ ✓ Mark stores: { persist: true }                            │
│ ✓ Keep payloads small (localStorage has ~5-10MB limit)      │
│ ✓ Don't persist sensitive data                              │
│ ✓ Test across page reloads                                  │
│ ✓ Consider clearing old data on app updates                 │
│ ✓ Use meaningful store names                                │
└─────────────────────────────────────────────────────────────┘
`;

console.log(bestPractices);

console.log("════════════════════════════════════════════════════════════════");
console.log("🎓 Next Steps:");
console.log("   • Try: 05-tab-sync (sync across browser tabs)");
console.log("   • Try: 03-async-fetching (load and cache data)");
console.log("════════════════════════════════════════════════════════════════\n");
