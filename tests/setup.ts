import { afterEach } from "node:test";
import { resetAllStoresForTest } from "../src/testing.js";

afterEach(() => {
  resetAllStoresForTest();
});
