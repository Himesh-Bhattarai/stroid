Topic: Validator rejection still updates history/devtools/metrics

Description:
When a validator returns false, the update is skipped but history entries, devtools actions, and notify/metrics still increment, giving a false impression that a mutation occurred.

Current Behaviour:
- State remains unchanged.
- History gains an entry, devtools shows an action, metrics/notify counts increment.

Expected Behaviour:
- If validation fails, no history/devtools/metrics/notify side effects should be recorded.

Repro:
1) createStore("user", {score:0}, { validator: next => next.score <= 10, devtools: true, historyLimit: 10 })
2) setStore("user", { score: 999 }) // validator returns false
3) Check getHistory("user") and devtools log/metrics.

Notes:
Guard history/devtools/metrics/notify behind successful validation result and avoid cloning/state updates when validator fails.

Suggested Labels: bug, validator, devtools, metrics, severity-medium, needs-triage
