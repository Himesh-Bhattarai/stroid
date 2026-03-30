/**
 * 🟣 Stroid Sandbox - Example 3: Async Fetching
 *
 * Demonstrates how to fetch data asynchronously and handle loading/error states.
 * Features:
 * - fetchStore() - Load data from API
 * - Auto re-render with loading state
 * - Error handling
 * - Caching and deduplication
 * - Revalidation
 */

import React, { useState } from "react";
import { createStore, getStore, clearAllStores } from "stroid";
import { useStore } from "stroid/react";
import { fetchStore, refetchStore } from "stroid/async";

// ═══════════════════════════════════════════════════════════════════════
// Simulated API Functions (in real app, these would be API calls)
// ═══════════════════════════════════════════════════════════════════════

const mockFetch = async (url: string): Promise<any> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  const routes: Record<string, any> = {
    "/api/user/1": {
      id: 1,
      name: "Alice Johnson",
      email: "alice@example.com",
      avatar: "👩"
    },
    "/api/products": [
      { id: 101, name: "Laptop", price: 999.99, stock: 5 },
      { id: 102, name: "Mouse", price: 29.99, stock: 20 },
      { id: 103, name: "Keyboard", price: 79.99, stock: 15 },
      { id: 104, name: "Monitor", price: 299.99, stock: 8 }
    ],
    "/api/posts": [
      { id: 1, title: "Getting Started with Stroid", likes: 42 },
      { id: 2, title: "State Management Best Practices", likes: 28 },
      { id: 3, title: "React Hooks Deep Dive", likes: 89 }
    ]
  };

  if (url in routes) {
    return routes[url];
  }

  throw new Error(`Not found: ${url}`);
};

// ═══════════════════════════════════════════════════════════════════════
// Setup: Create stores for async data
// ═══════════════════════════════════════════════════════════════════════

clearAllStores();

// Store for user data with async state
createStore("user", {
  id: null,
  name: null,
  email: null,
  avatar: null,
  loading: false,
  error: null,
  status: "idle"
});

// Store for products
createStore("products", {
  items: [],
  loading: false,
  error: null,
  status: "idle"
});

// Store for posts
createStore("posts", {
  items: [],
  loading: false,
  error: null,
  status: "idle"
});

// ═══════════════════════════════════════════════════════════════════════
// 1️⃣ Component: Load User Data
// ═══════════════════════════════════════════════════════════════════════

function UserLoader(): React.ReactElement {
  const user = useStore<any>("user");
  const [showDetails, setShowDetails] = useState(false);

  const handleLoadUser = async () => {
    // fetchStore automatically handles loading/success/error states
    await fetchStore(
      "user",
      mockFetch("/api/user/1"),
      {
        // Optional: customize how data is written to store
        stateAdapter: ({ next, set }) => {
          set((draft: any) => {
            draft.id = next.data?.id ?? null;
            draft.name = next.data?.name ?? null;
            draft.email = next.data?.email ?? null;
            draft.avatar = next.data?.avatar ?? null;
            draft.loading = next.loading;
            draft.error = next.error;
            draft.status = next.status;
          });
        }
      }
    );
  };

  return (
    <div className="border p-4 rounded">
      <h2>👤 Load User</h2>

      <button
        onClick={handleLoadUser}
        disabled={user.loading}
        className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {user.loading ? "Loading..." : "Load User"}
      </button>

      {user.error && (
        <div className="mt-2 bg-red-100 text-red-800 p-2 rounded">
          ❌ Error: {user.error}
        </div>
      )}

      {user.name && (
        <div className="mt-3 bg-green-50 p-3 rounded">
          <p>✅ User loaded! {user.avatar}</p>
          <p><strong>Name:</strong> {user.name}</p>
          <p><strong>Email:</strong> {user.email}</p>
        </div>
      )}

      <button
        onClick={() => setShowDetails(!showDetails)}
        className="mt-2 text-sm text-blue-500 underline"
      >
        {showDetails ? "Hide" : "Show"} raw state
      </button>

      {showDetails && (
        <pre className="mt-2 bg-gray-100 p-2 rounded text-xs overflow-auto">
          {JSON.stringify(user, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 2️⃣ Component: Load Products List
// ═══════════════════════════════════════════════════════════════════════

function ProductsLoader(): React.ReactElement {
  const products = useStore<any>("products");

  const handleLoadProducts = async () => {
    await fetchStore(
      "products",
      mockFetch("/api/products"),
      {
        stateAdapter: ({ next, set }) => {
          set((draft: any) => {
            draft.items = (next.data ?? []) as any[];
            draft.loading = next.loading;
            draft.error = next.error;
            draft.status = next.status;
          });
        }
      }
    );
  };

  const handleRefresh = async () => {
    // Refetch the same data (bypasses cache)
    await refetchStore("products", mockFetch("/api/products"), {
      stateAdapter: ({ next, set }) => {
        set((draft: any) => {
          draft.items = (next.data ?? []) as any[];
          draft.loading = next.loading;
          draft.error = next.error;
          draft.status = next.status;
        });
      }
    });
  };

  return (
    <div className="border p-4 rounded">
      <h2>📦 Products</h2>

      <div className="flex gap-2">
        <button
          onClick={handleLoadProducts}
          disabled={products.loading}
          className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {products.loading ? "Loading..." : "Load Products"}
        </button>

        <button
          onClick={handleRefresh}
          disabled={products.loading}
          className="bg-gray-500 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          🔄 Refresh
        </button>
      </div>

      {products.error && (
        <div className="mt-2 bg-red-100 text-red-800 p-2 rounded">
          ❌ Error: {products.error}
        </div>
      )}

      {products.items.length > 0 && (
        <div className="mt-3">
          <h3 className="font-bold">Items:</h3>
          <ul className="space-y-2 mt-2">
            {products.items.map((item: any) => (
              <li key={item.id} className="bg-gray-50 p-2 rounded">
                <strong>{item.name}</strong> - ${item.price}
                <span className="text-sm text-gray-600 ml-2">
                  ({item.stock} in stock)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {products.loading && <p className="mt-2 text-gray-600">⏳ Loading...</p>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 3️⃣ Component: Load Posts with Multiple Loads
// ═══════════════════════════════════════════════════════════════════════

function PostsLoader(): React.ReactElement {
  const posts = useStore<any>("posts");

  const handleLoadPosts = async () => {
    await fetchStore(
      "posts",
      mockFetch("/api/posts"),
      {
        dedupe: true,  // Prevent duplicate requests
        stateAdapter: ({ next, set }) => {
          set((draft: any) => {
            draft.items = (next.data ?? []) as any[];
            draft.loading = next.loading;
            draft.error = next.error;
            draft.status = next.status;
          });
        }
      }
    );
  };

  return (
    <div className="border p-4 rounded">
      <h2>📰 Posts</h2>

      <button
        onClick={handleLoadPosts}
        disabled={posts.loading}
        className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {posts.loading ? "Loading..." : "Load Posts"}
      </button>

      {posts.items.length > 0 && (
        <div className="mt-3 space-y-2">
          {posts.items.map((post: any) => (
            <div key={post.id} className="bg-blue-50 p-2 rounded">
              <p><strong>{post.title}</strong></p>
              <p className="text-sm text-gray-600">👍 {post.likes} likes</p>
            </div>
          ))}
        </div>
      )}

      {posts.loading && <p className="mt-2 text-gray-600">⏳ Loading...</p>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 4️⃣ Info: Caching Demonstration
// ═══════════════════════════════════════════════════════════════════════

function CachingInfo(): React.ReactElement {
  return (
    <div className="bg-yellow-50 p-3 rounded border-l-4 border-yellow-400">
      <h3 className="font-bold">💾 Caching & Deduplication</h3>
      <ul className="text-sm space-y-1 mt-2">
        <li>✓ Stroid caches fetch results automatically</li>
        <li>✓ Duplicate requests are avoided (dedupe: true)</li>
        <li>✓ Use refetchStore() to bypass cache and get fresh data</li>
        <li>✓ State automatically updates loading/error/data</li>
        <li>✓ Use with patience! Demo has 1s delays</li>
      </ul>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Main App
// ═══════════════════════════════════════════════════════════════════════

function App(): React.ReactElement {
  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-3xl font-bold">🟣 Stroid Async Example</h1>

      <CachingInfo />

      <UserLoader />
      <ProductsLoader />
      <PostsLoader />

      <div className="bg-gray-100 p-3 rounded text-sm">
        <h3 className="font-bold mb-2">🤓 What This Teaches:</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><code>fetchStore()</code> - Load data with auto state management</li>
          <li><code>stateAdapter</code> - Customize how data is stored</li>
          <li><code>dedupe: true</code> - Prevent duplicate requests</li>
          <li><code>refetchStore()</code> - Force fresh data (skip cache)</li>
          <li>Loading/error states managed automatically</li>
        </ul>
      </div>
    </div>
  );
}

export {
  App,
  UserLoader,
  ProductsLoader,
  PostsLoader,
  CachingInfo,
  mockFetch
};

/*
═══════════════════════════════════════════════════════════════════════════
💡 KEY CONCEPTS: Async Data Fetching
═══════════════════════════════════════════════════════════════════════════

1. FETCHSTORE - Load data with built-in state management
   await fetchStore("users", fetchPromise, options)

   Automatically handles:
   • loading: false ➜ true (while fetching) ➜ false
   • success: data stored in state
   • error: error message stored if something fails

2. CACHING & DEDUPLICATION
   • By default, Stroid caches results
   • Duplicate requests are prevented
   • Use dedupe: false to allow parallel requests

3. STATEADAPTER - How to store fetched data
   {
     stateAdapter: ({ next, set }) => {
       set(draft => {
         draft.items = next.data;
         draft.loading = next.loading;
         draft.error = next.error;
       })
     }
   }

4. REFETCH - Get fresh data (bypass cache)
   await refetchStore("users", fetchPromise)

5. TYPICAL FLOW
   1. Call fetchStore() with API promise
   2. Component shows loading spinner
   3. Data arrives → state updates
   4. Component re-renders with data
   5. If error → error message shows

═══════════════════════════════════════════════════════════════════════════
*/
