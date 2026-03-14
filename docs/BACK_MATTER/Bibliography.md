# Bibliography

This bibliography is intentionally practical rather than ceremonial.

It lists the material that meaningfully informs the current Stroid documentation book:

- the codebase
- the test suite
- the internal architecture notes
- the earlier documentation set
- a small number of relevant external conceptual references

## Primary Project Sources

- [src/store.ts](/src/store.ts)
- [src/adapters/options.ts](/src/adapters/options.ts)
- [src/async.ts](/src/async.ts)
- [src/features/persist.ts](/src/features/persist.ts)
- [src/features/sync.ts](/src/features/sync.ts)
- [src/feature-registry.ts](/src/feature-registry.ts)
- [src/hooks.ts](/src/hooks.ts)
- [src/selectors.ts](/src/selectors.ts)
- [src/runtime-tools.ts](/src/runtime-tools.ts)
- [src/runtime-admin.ts](/src/runtime-admin.ts)
- [src/server.ts](/src/server.ts)
- [src/testing.ts](/src/testing.ts)

## Test Sources

- [tests/store.test.ts](/tests/store.test.ts)
- [tests/options-adapter.test.ts](/tests/options-adapter.test.ts)
- [tests/async.test.ts](/tests/async.test.ts)
- [tests/persist.test.ts](/tests/persist.test.ts)
- [tests/sync.test.ts](/tests/sync.test.ts)
- [tests/react-hooks.test.tsx](/tests/react-hooks.test.tsx)
- [tests/testing.test.ts](/tests/testing.test.ts)
- [tests/heavy/stress-memory.heavy.ts](/tests/heavy/stress-memory.heavy.ts)
- [tests/heavy/environment.heavy.ts](/tests/heavy/environment.heavy.ts)

## Internal Documentation Sources

- [docs/FRONT_MATTER/CONTENTS.md](/docs/FRONT_MATTER/CONTENTS.md)
- [docs/ARCHITECTURE/ARCHITECTURE.md](/docs/ARCHITECTURE/ARCHITECTURE.md)
- [docs/BODY_MATTER/CORE_OF_STROID/INTRODUCTION.md](/docs/BODY_MATTER/CORE_OF_STROID/INTRODUCTION.md)
- [docs/BODY_MATTER/ASYNC_OF_STROID/INTRODUCTION.md](/docs/BODY_MATTER/ASYNC_OF_STROID/INTRODUCTION.md)
- [docs/BODY_MATTER/PERSIST_OF_STROID/INTRODUCTION.md](/docs/BODY_MATTER/PERSIST_OF_STROID/INTRODUCTION.md)
- [docs/BODY_MATTER/SYNC_OF_STROID/INTRODUCTION.md](/docs/BODY_MATTER/SYNC_OF_STROID/INTRODUCTION.md)
- [docs/BODY_MATTER/DEVTOOLS_OF_STROID/INTRODUCTION.md](/docs/BODY_MATTER/DEVTOOLS_OF_STROID/INTRODUCTION.md)
- [docs/BODY_MATTER/REACT_OF_STROID/INTRODUCTION.md](/docs/BODY_MATTER/REACT_OF_STROID/INTRODUCTION.md)

## External Conceptual References

These are not treated here as authority over Stroid's API.
They are relevant because they influence the surrounding design conversation:

- React documentation, especially `useSyncExternalStore`
- BroadcastChannel API documentation
- TypeScript documentation for public type behavior and version constraints
- wider state-management ecosystem patterns around selectors, persistence, and sync

## Honest Note

This bibliography is not pretending to be a formal academic citation set yet.

It is a practical map of what this documentation is grounded in.

That is more useful for the current book than decorative citation formatting.


## Navigation

- Previous: [Appendices](APPENDICES.md)
- Jump to: [Back Matter](../FRONT_MATTER/CONTENTS.md#back-matter)
- Next: [Colophon](Colophon.md)

