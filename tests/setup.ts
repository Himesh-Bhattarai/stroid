/**
 * @module tests/setup
 *
 * LAYER: Tests
 * OWNS:  Test coverage for tests/setup.
 *
 * Consumers: Test runner.
 */
import { afterEach } from "node:test";
import { JSDOM } from "jsdom";
import { cleanup } from "@testing-library/react";

// Force dev-mode warnings for test expectations.
(globalThis as any).__STROID_DEV__ = true;
// Silence verbose dev logs to keep test output readable.
console.log = () => {};

const bootstrapDom = (): void => {
  if (typeof (globalThis as any).window !== "undefined" && typeof (globalThis as any).document !== "undefined") return;
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  const { window: domWindow } = dom;

  (globalThis as any).window = domWindow;
  (globalThis as any).document = domWindow.document;
  if (!("navigator" in globalThis)) {
    Object.defineProperty(globalThis, "navigator", {
      value: domWindow.navigator,
      configurable: true,
    });
  }
  (globalThis as any).HTMLElement = domWindow.HTMLElement;
  (globalThis as any).Node = domWindow.Node;
  (globalThis as any).Element = domWindow.Element;
  (globalThis as any).Text = domWindow.Text;
  (globalThis as any).Event = domWindow.Event;
  (globalThis as any).CustomEvent = domWindow.CustomEvent;
  (globalThis as any).MutationObserver = domWindow.MutationObserver;
  (globalThis as any).getComputedStyle = domWindow.getComputedStyle.bind(domWindow);
  (globalThis as any).requestAnimationFrame = domWindow.requestAnimationFrame?.bind(domWindow)
    ?? ((cb: FrameRequestCallback) => setTimeout(cb, 0));
  (globalThis as any).cancelAnimationFrame = domWindow.cancelAnimationFrame?.bind(domWindow)
    ?? ((id: number) => clearTimeout(id));

  // Keep tests exercising missing BroadcastChannel paths unless explicitly mocked.
  Object.defineProperty(globalThis, "BroadcastChannel", {
    value: undefined,
    configurable: true,
    writable: true,
  });
};

bootstrapDom();
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const { resetAllStoresForTest } = await import("../src/helpers/testing.js");

afterEach(() => {
  cleanup();
  resetAllStoresForTest();
});


