Topic: Middleware throw leaves pending notifications stuck

Description:
When a middleware throws, `_runMiddleware` aborts but the store was already queued in `_pendingNotifications`. No flush runs and later updates never notify subscribers.

Current Behaviour:
- Exception in middleware stops the pipeline.
- `_pendingNotifications` retains the store name but flush is skipped.
- Subsequent updates to that store never notify subscribers.

Expected Behaviour:
- Middleware errors are caught/logged.
- Pending notifications are flushed or cleared so future updates notify normally.

Repro:
1) createStore("prefs", { theme:"dark" }, { middleware:[() => { throw new Error("boom") }] })
2) setStore("prefs.theme", "light")
3) Subsequent valid setStore calls do not notify subscribers.

Notes:
Wrap middleware in try/catch and ensure `_pendingNotifications` is flushed or cleared even on middleware failure.

Suggested Labels: bug, middleware, notifications, severity-high, needs-triage
