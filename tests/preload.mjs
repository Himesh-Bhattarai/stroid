globalThis.__STROID_DEV__ = true;
if (typeof process !== "undefined" && process?.env && !process.env.NODE_ENV) {
  process.env.NODE_ENV = "test";
}
