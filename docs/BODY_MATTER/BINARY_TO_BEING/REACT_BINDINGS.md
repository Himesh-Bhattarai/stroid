# Chapter 65: React Bindings

## Problem

React turns state mistakes into render mistakes.

## Why Existing Solutions Fail

Bindings fail when they blur:

- component-local state
- app-level shared state
- subscription precision

## Design Principle

React should be a consumer of the runtime, not the definition of the runtime.

## Architecture

Stroid keeps React bindings in `stroid/react`:

- `useStore`
- `useSelector`
- `useStoreStatic`
- `useAsyncStore`
- `useFormStore`

The runtime still exists outside React.

## Implementation

```tsx
import { useStore } from "stroid/react";

function ThemeLabel() {
  const mode = useStore("theme", "mode");
  return <span>{mode}</span>;
}
```

This keeps React integration strong without making React the only state host.


## Navigation

- Previous: [Chapter 64: Selectors](SELECTORS.md)
- Jump to: [Unit Fifteen: Binary to Being](../../FRONT_MATTER/CONTENTS.md#unit-fifteen-binary-to-being)
- Next: [Chapter 66: Tooling and Debugging](TOOLING_AND_DEBUGGING.md)
