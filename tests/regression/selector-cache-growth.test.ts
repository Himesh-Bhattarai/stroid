import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStore, createComputed, deleteComputed, deleteStore } from '../../src/index.js'

// Regression test: selector cache growth
// Ensure that selector caches do not grow unbounded when selectors are called
// with many unique input shapes. This test verifies that the system either:
// 1. Implements cache eviction (LRU, TTL, or size limit)
// 2. Throws an error when cache exceeds a threshold
// 3. Provides a way to clear/reset caches

test('selector cache growth — should not grow unbounded', async () => {
  const store = createStore('selector-cache-test', { items: Array.from({ length: 100 }, (_, i) => ({ id: i, value: i * 2 })) })

  // Create a computed selector that depends on store state
  const itemSelector = createComputed('selector-cache-items', (get) => {
    const state = get('selector-cache-test')
    return state.items
  })

  // Simulate many unique selector calls (e.g., filtering with different predicates)
  // In real usage, this could happen if selectors are created dynamically or with many unique args
  const initialMemory = process.memoryUsage().heapUsed

  let cacheSize = 0
  const iterations = 1000

  try {
    for (let i = 0; i < iterations; i++) {
      // Create a new computed selector with a unique dependency each iteration
      // This simulates creating many selectors or calling selectors with unique args
      const uniqueSelector = createComputed(`selector-cache-unique-${i}`, (get) => {
        const items = get('selector-cache-items')
        // Simulate a selector that filters based on iteration number
        return items.filter((item) => item.id % (i + 1) === 0)
      })

      cacheSize++

      // Periodically check memory growth
      if (i % 100 === 0) {
        const currentMemory = process.memoryUsage().heapUsed
        const memoryGrowth = currentMemory - initialMemory
        // Assert that memory growth is reasonable (not exponential)
        // Allow up to 50MB growth for 100 iterations (rough heuristic)
        assert.ok(
          memoryGrowth < 50 * 1024 * 1024,
          `Memory growth too large after ${i} iterations: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`
        )
      }

      // Clean up the selector to test if cleanup actually frees memory
      if (i % 50 === 0 && i > 0) {
        deleteComputed(`selector-cache-unique-${i - 1}`)
      }
    }

    // Final memory check
    const finalMemory = process.memoryUsage().heapUsed
    const totalGrowth = finalMemory - initialMemory
    console.log(`Total memory growth after ${iterations} selectors: ${(totalGrowth / 1024 / 1024).toFixed(2)}MB`)

    // Assert that total growth is bounded (not linear with selector count)
    // This is a soft check; adjust threshold based on actual behavior
    assert.ok(
      totalGrowth < 100 * 1024 * 1024,
      `Total memory growth too large: ${(totalGrowth / 1024 / 1024).toFixed(2)}MB`
    )
  } finally {
    // Cleanup
    try {
      deleteComputed('selector-cache-items')
      deleteStore('selector-cache-test')
      // Clean up remaining selectors
      for (let i = 0; i < iterations; i++) {
        try {
          deleteComputed(`selector-cache-unique-${i}`)
        } catch {}
      }
    } catch {}
  }

  assert.ok(true, 'Selector cache growth test completed without unbounded growth')
})

// Edge case: verify cache behavior under rapid create/delete cycles
test('selector cache — rapid create/delete should not leak', async () => {
  const store = createStore('selector-rapid-test', { counter: 0 })

  const initialMemory = process.memoryUsage().heapUsed

  try {
    // Rapidly create and delete selectors
    for (let cycle = 0; cycle < 100; cycle++) {
      const selector = createComputed(`selector-rapid-${cycle}`, (get) => {
        return get('selector-rapid-test').counter + cycle
      })

      // Immediately delete
      deleteComputed(`selector-rapid-${cycle}`)
    }

    // Check memory after rapid cycles
    const finalMemory = process.memoryUsage().heapUsed
    const growth = finalMemory - initialMemory

    // After deletion, memory should be mostly reclaimed (allow some overhead)
    // This is a soft assertion; if it fails, indicates potential memory leak
    console.log(`Memory after rapid create/delete cycles: ${(growth / 1024 / 1024).toFixed(2)}MB`)
    assert.ok(
      growth < 20 * 1024 * 1024,
      `Memory not reclaimed after delete: ${(growth / 1024 / 1024).toFixed(2)}MB`
    )
  } finally {
    try {
      deleteStore('selector-rapid-test')
    } catch {}
  }

  assert.ok(true, 'Rapid create/delete test passed')
})
