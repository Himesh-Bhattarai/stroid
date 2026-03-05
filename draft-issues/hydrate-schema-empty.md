Topic: hydrateStores + schema failure leaves unusable store shell

Description:
When hydration data fails schema validation, `hydrateStores` still creates/updates the store but without a valid `_initial` snapshot. `resetStore` can throw and subscribers see null/empty state.

Current Behaviour:
- Store created/updated even though schema rejects data.
- `_initial` missing or mismatched; resetStore fails.
- Subscribers see null/empty value.

Expected Behaviour:
- On schema failure, skip creating/updating the store; leave existing state intact.
- Ensure `_initial` remains valid so resetStore always works.

Repro:
1) createStore("profile", { name: "ok" }, { schema: v => typeof v.name === "string" })
2) hydrateStores({ profile: { name: 123 } })
3) call resetStore("profile") or subscribe to profile

Notes:
Abort hydration write on schema failure; do not mutate `_stores` or `_initial` when validation fails.

Suggested Labels: bug, schema, hydration, severity-high, needs-triage
