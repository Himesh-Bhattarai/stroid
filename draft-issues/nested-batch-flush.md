Topic: Nested setStoreBatch can double-flush or drop notifications

Description:
setStoreBatch inside another setStoreBatch schedules multiple flushes. Depending on timing or thrown errors, this yields double notifications (extra renders) or no flush (missed renders).

Current Behaviour:
- Inner batch schedules a flush while outer batch also schedules one.
- If an error occurs inside, pending notifications may never flush.
- Some runs cause two notify passes; others cause none.

Expected Behaviour:
- Nesting should result in a single flush when outermost batch completes.
- Errors should still allow pending notifications to flush (or safely clear).

Repro:
1) setStoreBatch(() => {
     setStoreBatch(() => {
       setStore("ui.flag", true)
     })
     setStore("ui.flag", false)
   })
2) Observe subscriber call counts: sometimes 2, sometimes 0 if an error occurs.

Notes:
Track batch depth; only schedule flush when depth returns to zero; ensure finally block flushes even after exceptions.

Suggested Labels: bug, batching, notifications, severity-high, needs-triage
