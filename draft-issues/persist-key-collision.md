Topic: Persist key collision leaves stale ownership map

Description:
Creating two stores with the same persist key warns but still records the second store in `_persistKeys`. Deleting the first store later leaves the key claimed, blocking future stores from using that key.

Current Behaviour:
- Collision warning fires on the second store.
- `_persistKeys` retains the collision entry.
- After deleting the first store, the key remains blocked and later stores cannot use it.

Expected Behaviour:
- Collision should either fail atomically (no `_persistKeys` change) or release the key when the first owner is deleted.
- After deleting the first store, a new store should be able to use the key, or the collision warning should reflect the current owner.

Repro:
1) createStore("a", {x:1}, { persist: { key: "k", driver: localStorage } })
2) createStore("b", {y:1}, { persist: { key: "k", driver: localStorage } }) // expect warning
3) deleteStore("a")
4) createStore("c", {z:1}, { persist: { key: "k", driver: localStorage } })

Notes:
Clear `_persistKeys` on collision or in deleteStore when removing the first owner; alternatively block recording the second store in `_persistKeys` if collision occurs.

Suggested Labels: bug, persistence, core, severity-medium, needs-triage
