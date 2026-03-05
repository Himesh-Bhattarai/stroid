Topic: deleteStore throws when custom persist driver lacks removeItem

Description:
If a custom persist driver provides get/set but not removeItem, `deleteStore` calls removeItem unguarded and throws, leaving subscribers/history/state uncleared.

Current Behaviour:
- deleteStore invokes driver.removeItem without checking existence.
- TypeError thrown; cleanup halts mid-way.

Expected Behaviour:
- deleteStore should skip removeItem when absent and still complete cleanup.

Repro:
1) createStore("prefs", { theme:"dark" }, { persist: { driver: { getItem:()=>null, setItem:()=>{} , key:"x" } } })
2) deleteStore("prefs")

Notes:
Feature-detect removeItem before calling; treat missing removeItem as a no-op.

Suggested Labels: bug, persistence, cleanup, severity-medium, needs-triage
