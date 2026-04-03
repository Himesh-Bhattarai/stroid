/**
 * React hook edge-case stress tests.
 *
 * WHAT: Tests broad subscriptions, selector stability, async lifecycle transitions, and mount/unmount churn.
 * WHY: Hook-level regressions create user-visible jank, stale UI, and memory leaks under real workloads.
 */
import { useEffect } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createStore, getStore, setStore } from "stroid";
import { fetchStore } from "stroid/async";
import { useAsyncStore, useFormStore, useSelector, useStore, useStoreField, useStoreStatic } from "stroid/react";
import { createFlatObject, flushMicrotasks } from "../shared/mocks";

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

const ensureAsyncStore = (name: string): void => {
    createStore(name, {
        data: null,
        loading: false,
        error: null,
        status: "idle",
    });
};

describe("stress react hooks", () => {
    it("warns in dev for full-store subscription and re-renders on single field update", async () => {
        createStore("hooks.full", createFlatObject(1000));
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        let renders = 0;

        const FullSubscriber = () => {
            const snapshot = useStore("hooks.full") as Record<string, number> | null;
            renders += 1;
            return <div data-testid="value">{String(snapshot?.k0 ?? "n/a")}</div>;
        };

        render(<FullSubscriber />);
        expect(renders).toBe(1);

        act(() => {
            setStore("hooks.full", "k5", 9999);
        });

        await waitFor(() => {
            expect(renders).toBe(2);
        });
        expect(warnSpy.mock.calls.some((call) =>
            String(call[0]).includes("subscribes to the entire store")
        )).toBe(true);
    });

    it("does not re-render useSelector consumer when selected output stays equal", async () => {
        createStore("hooks.selector", { count: 0, other: 0 });
        let renders = 0;

        const SelectorComponent = () => {
            const selected = useSelector(
                "hooks.selector",
                (state: { count: number }) => ({ even: state.count % 2 === 0 })
            );
            renders += 1;
            return <div data-testid="selected">{String(selected?.even ?? false)}</div>;
        };

        render(<SelectorComponent />);
        expect(renders).toBe(1);

        act(() => {
            setStore("hooks.selector", "other", 1);
            setStore("hooks.selector", "count", 2); // parity unchanged
        });
        await flushMicrotasks(5);
        expect(renders).toBe(1);

        act(() => {
            setStore("hooks.selector", "count", 3); // parity changes
        });
        await waitFor(() => {
            expect(renders).toBe(2);
        });
    });

    it("keeps useStoreField targeted and useStoreStatic non-reactive", async () => {
        createStore("hooks.field", { a: 1, b: 1 });
        let fieldRenders = 0;
        let staticRenders = 0;

        const FieldReader = () => {
            useStoreField("hooks.field", "a");
            fieldRenders += 1;
            return null;
        };

        const StaticReader = () => {
            useStoreStatic("hooks.field", "a");
            staticRenders += 1;
            return null;
        };

        render(
            <>
                <FieldReader />
                <StaticReader />
            </>
        );

        act(() => {
            setStore("hooks.field", "b", 2);
        });
        await flushMicrotasks(4);
        expect(fieldRenders).toBe(1);
        expect(staticRenders).toBe(1);

        act(() => {
            setStore("hooks.field", "a", 3);
        });
        await waitFor(() => {
            expect(fieldRenders).toBe(2);
        });
        expect(staticRenders).toBe(1);
    });

    it("tracks useAsyncStore loading/error/success transitions without torn state", async () => {
        ensureAsyncStore("hooks.async.transitions");
        const pending = deferred<{ value: string }>();
        const seen: Array<{ status: string; loading: boolean; error: string | null; data: unknown }> = [];

        const View = () => {
            const asyncState = useAsyncStore("hooks.async.transitions");
            useEffect(() => {
                seen.push({
                    status: asyncState.status,
                    loading: asyncState.loading,
                    error: asyncState.error,
                    data: asyncState.data,
                });
            }, [asyncState.status, asyncState.loading, asyncState.error, asyncState.data]);

            useEffect(() => {
                void fetchStore("hooks.async.transitions", pending.promise, {
                    dedupe: false,
                    signal: new AbortController().signal,
                });
            }, []);
            return null;
        };

        render(<View />);
        await waitFor(() => {
            expect((getStore("hooks.async.transitions") as { status: string }).status).toBe("loading");
        });

        pending.resolve({ value: "ok" });
        await waitFor(() => {
            expect((getStore("hooks.async.transitions") as { status: string }).status).toBe("success");
        });

        expect(seen.some((entry) => entry.status === "loading" && entry.loading)).toBe(true);
        expect(seen.some((entry) => entry.status === "success" && entry.loading === false)).toBe(true);
        expect(seen.some((entry) => entry.status === "success" && entry.error != null)).toBe(false);
    });

    it("does not leak subscription or emit unmounted setState warnings after async unmount", async () => {
        ensureAsyncStore("hooks.async.unmount");
        const pending = deferred<{ value: string }>();
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        const View = () => {
            useAsyncStore("hooks.async.unmount");
            useEffect(() => {
                void fetchStore("hooks.async.unmount", pending.promise, {
                    dedupe: false,
                    signal: new AbortController().signal,
                });
            }, []);
            return null;
        };

        const ui = render(<View />);
        ui.unmount();
        pending.resolve({ value: "late" });
        await flushMicrotasks(6);

        expect(
            errorSpy.mock.calls.some((call) => String(call[0]).toLowerCase().includes("unmounted"))
        ).toBe(false);
    });

    it("keeps hook churn stable after rapidly mounting/unmounting 100 times", async () => {
        createStore("hooks.churn", { value: 0 });
        let renders = 0;

        const Reader = () => {
            useStore("hooks.churn");
            renders += 1;
            return null;
        };

        for (let i = 0; i < 100; i += 1) {
            const ui = render(<Reader />);
            ui.unmount();
        }

        const rendersAfterUnmount = renders;
        setStore("hooks.churn", { value: 1 });
        await flushMicrotasks(5);
        expect(renders).toBe(rendersAfterUnmount);
    });

    it("handles useFormStore empty, special-char, and XSS-like strings", () => {
        createStore("hooks.form", { name: "", note: "" });

        const Form = () => {
            const name = useFormStore("hooks.form", "name");
            const note = useFormStore("hooks.form", "note");
            return (
                <>
                    <input data-testid="name" value={String(name.value ?? "")} onChange={name.onChange} />
                    <input data-testid="note" value={String(note.value ?? "")} onChange={note.onChange} />
                </>
            );
        };

        render(<Form />);

        fireEvent.change(screen.getByTestId("name"), { target: { value: "" } });
        fireEvent.change(screen.getByTestId("note"), { target: { value: "special ~!@#$%^&*()_+" } });
        fireEvent.change(screen.getByTestId("name"), { target: { value: "<script>alert('xss')</script>" } });

        expect(getStore("hooks.form")).toEqual({
            name: "<script>alert('xss')</script>",
            note: "special ~!@#$%^&*()_+",
        });
    });
});
