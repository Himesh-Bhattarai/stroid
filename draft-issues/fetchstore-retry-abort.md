Topic: fetchStore retries ignore AbortSignal between attempts

Description:
When `retry > 0` and the request is aborted during backoff, the retry still proceeds because the AbortSignal is not checked before scheduling the next attempt.

Current Behaviour:
- Abort during retry backoff does not stop the next retry.
- Additional network requests fire after abort, potentially mutating state.

Expected Behaviour:
- Abort should cancel pending retries; no further network attempts and state should settle to aborted/error.

Repro:
1) const controller = new AbortController()
2) fetchStore("data", "/fail", { retry: 2, retryDelay: 1000, signal: controller.signal })
3) Abort during backoff window

Notes:
Check `signal.aborted` before scheduling each retry; propagate abort to clear inflight registry and mark status aborted.

Suggested Labels: bug, async, abort, severity-medium, needs-triage
