/**
 * @module tests/types/assert
 *
 * LAYER: Tests
 * OWNS:  Test coverage for tests/types/assert.
 *
 * Consumers: Test runner.
 */
export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
    (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

export type Expect<T extends true> = T;


