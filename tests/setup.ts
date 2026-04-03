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

type MinimalWindow = {
  addEventListener: (...args: unknown[]) => void;
  removeEventListener: (...args: unknown[]) => void;
};

type GlobalTestEnv = typeof globalThis & {
  __STROID_DEV__?: boolean;
  window?: Window | MinimalWindow;
  document?: Document;
  navigator?: Navigator;
  HTMLElement?: typeof HTMLElement;
  Node?: typeof Node;
  Element?: typeof Element;
  Text?: typeof Text;
  Event?: typeof Event;
  CustomEvent?: typeof CustomEvent;
  MutationObserver?: typeof MutationObserver;
  getComputedStyle?: typeof getComputedStyle;
  requestAnimationFrame?: (cb: FrameRequestCallback) => number;
  cancelAnimationFrame?: (id: number) => void;
  BroadcastChannel?: typeof BroadcastChannel | undefined;
};

const g = globalThis as GlobalTestEnv;

// Force dev-mode warnings for test expectations.
g.__STROID_DEV__ = true;
// Silence verbose dev logs to keep test output readable.
console.log = () => {};

const bootstrapDom = (): void => {
  if (typeof g.window !== "undefined" && typeof g.document !== "undefined") return;
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  const { window: domWindow } = dom;

  g.window = domWindow;
  g.document = domWindow.document;
  if (!("navigator" in globalThis)) {
    Object.defineProperty(globalThis, "navigator", {
      value: domWindow.navigator,
      configurable: true,
    });
  }
  g.HTMLElement = domWindow.HTMLElement;
  g.Node = domWindow.Node;
  g.Element = domWindow.Element;
  g.Text = domWindow.Text;
  g.Event = domWindow.Event;
  g.CustomEvent = domWindow.CustomEvent;
  g.MutationObserver = domWindow.MutationObserver;
  g.getComputedStyle = domWindow.getComputedStyle.bind(domWindow);
  g.requestAnimationFrame = domWindow.requestAnimationFrame?.bind(domWindow)
    ?? ((cb: FrameRequestCallback) => setTimeout(cb, 0));
  g.cancelAnimationFrame = domWindow.cancelAnimationFrame?.bind(domWindow)
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
const { resetConfig } = await import("../src/config.js");

afterEach(() => {
  cleanup();
  resetConfig();
  resetAllStoresForTest();
});

