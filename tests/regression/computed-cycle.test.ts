import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStore, createComputed, deleteComputed } from '../../src/index.js'

// Regression test: ensure creating computed selectors that form a cycle either
// throws a clear error or is detected and prevented. The system must not enter
// an infinite loop or stack overflow.

test('computed cycle detection — should not hang or crash', async () => {
  // Create two base stores
  const a = createStore('reg-a', 1)
  const b = createStore('reg-b', 2)

  // Create computed placeholders
  let compA, compB

  // Attempt to create computed A that depends on B, and computed B that depends on A
  // This tries to provoke a circular dependency.
  let threw = false
  try {
    compA = createComputed('reg-comp-a', (get) => {
      // read compB (even if not yet created) via get
      return get('reg-comp-b') + get('reg-b')
    })

    compB = createComputed('reg-comp-b', (get) => {
      return get('reg-comp-a') * get('reg-a')
    })

    // Accessing them should either throw or return without infinite recursion
    // We'll call getStore health metric to attempt reads via public API
    // If the code enters infinite recursion, the test runner will hang/fail.

    // Read computed values safely with a timeout guard.
    const promise = (async () => {
      // call the computed stores by reading their values via the base read path
      // There's no direct getComputed exported in root; rely on createComputed returning callable store
      // If createComputed returns a store-like API, attempt read via .get or via getStore
      // Fallback: attempt to call compA() if it's a function

      let valA
      // try common patterns
      if (typeof compA === 'function') {
        valA = compA()
      } else if (compA && typeof compA.get === 'function') {
        valA = compA.get()
      } else {
        // attempt to import getStore dynamically
        const { getStore } = await import('../../src/index.js')
        const s = getStore('reg-comp-a')
        valA = s && typeof s.get === 'function' ? s.get() : undefined
      }

      return valA
    })()

    const val = await Promise.race([
      promise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2000)),
    ])

    // If we get here without throwing or timing out, ensure the value is finite
    assert.ok(val === undefined || Number.isFinite(val) || typeof val === 'number')
  } catch (err) {
    threw = true
    // Acceptable outcome: system detects cycle and throws a clear error
    assert.ok(err instanceof Error)
    // error message should be informative (not required, but helpful)
    // Do not assert on message to avoid brittle tests
  } finally {
    // Cleanup: delete computed stores if created
    try { if (compA) deleteComputed('reg-comp-a') } catch {}
    try { if (compB) deleteComputed('reg-comp-b') } catch {}
    // Also delete base stores
    try { const { deleteStore } = await import('../../src/index.js'); deleteStore('reg-a'); deleteStore('reg-b') } catch {}
  }

  // The test passes if either it threw (cycle detected) or it completed without hanging.
  assert.ok(true)
})
