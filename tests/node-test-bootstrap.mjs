// Load tsx from inside one preload module so Node 18 can transpile the
// subsequent setup import (separate --import entries do not apply hooks soon enough).
await import("tsx");
await import("./preload.mjs");
await import("./setup.ts");
