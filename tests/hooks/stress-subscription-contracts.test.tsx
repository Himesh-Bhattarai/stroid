/**
 * Hook subscription contract stress tests.
 *
 * WHAT: Verifies no-op writes do not trigger re-renders, selector identity churn warns once, and Suspense dedupes in-flight work.
 * WHY: React external-store contracts are brittle under StrictMode and concurrent rendering; regressions cause jank or loops.
 */
import { StrictMode, Suspense } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createStore, setStore } from "stroid";
import { useAsyncStoreSuspense, useSelector, useStoreField } from "stroid/react";
import { flushMicrotasks } from "../shared/mocks";

const makeJsonResponse = (data: unknown): Response => ({
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: () => "application/json" },
    json: async () => data,
    text: async () => JSON.stringify(data),
} as unknown as Response);

describe("stress hook subscription contracts", () => {
    it("does not re-render subscribers on repeated no-op writes", async () => {
        createStore("hooks.noop", { count: 1 });
        let renders = 0;

        const Counter = () => {
            useStoreField("hooks.noop", "count");
            renders += 1;
            return null;
        };

        render(<Counter />);
        expect(renders).toBe(1);

        act(() => {
            for (let i = 0; i < 200; i += 1) {
                setStore("hooks.noop", "count", 1);
            }
        });
        await flushMicrotasks(10);

        expect(renders).toBe(1);
    });

    it("warns once for selector identity churn under StrictMode", async () => {
        createStore("hooks.selector-warning", { value: 3 });
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        const Probe = ({ tick }: { tick: number }) => {
            useSelector("hooks.selector-warning", (state: { value: number }) => state.value + tick);
            return null;
        };

        const ui = render(
            <StrictMode>
                <Probe tick={0} />
            </StrictMode>
        );

        for (let i = 1; i <= 6; i += 1) {
            ui.rerender(
                <StrictMode>
                    <Probe tick={i} />
                </StrictMode>
            );
        }
        await flushMicrotasks(6);

        const selectorWarnings = warnSpy.mock.calls.filter((call) =>
            String(call[0]).includes("selector was recreated")
        );
        expect(selectorWarnings).toHaveLength(1);
    });

    it("reuses one in-flight fetch across three Suspense consumers", async () => {
        const realFetch = globalThis.fetch;
        let calls = 0;

        globalThis.fetch = vi.fn(async () => {
            calls += 1;
            await Promise.resolve();
            return makeJsonResponse({ name: "Ada" });
        }) as typeof fetch;

        const User = () => {
            const user = useAsyncStoreSuspense<{ name: string }>(
                "hooks.suspense.dedupe",
                "https://example.test/suspense",
                { autoCreate: true, dedupe: true }
            );
            return <span data-testid="user-name">{user.name}</span>;
        };

        try {
            render(
                <Suspense fallback={<span data-testid="loading">loading</span>}>
                    <User />
                    <User />
                    <User />
                </Suspense>
            );

            await waitFor(() => {
                expect(screen.getAllByTestId("user-name")).toHaveLength(3);
            });
            expect(calls).toBe(1);
        } finally {
            globalThis.fetch = realFetch;
        }
    });
});

