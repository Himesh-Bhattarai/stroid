# Introduction

Most state-management documentation has one recurring problem:

it explains APIs before it explains intent.

That makes a library look easier than it really is.

A developer can copy an example in two minutes and still not understand:

- when to create a store
- when a store should be temporary or global
- when a feature must be imported explicitly
- when the library is helping and when it is getting in the way

This book is written to fix that.

Stroid is built around a simple base idea:

`createStore(name, initialState, options)`

But that simple shape carries a lot of meaning:

- a named state model
- unified options
- explicit scope
- explicit feature imports
- runtime behavior that stays visible instead of hiding in wrappers

This documentation is organized to match how a serious developer actually learns a tool:

1. understand core first
2. understand optional feature boundaries second
3. understand environment-specific layers third
4. understand tradeoffs before committing fully

The aim is not to make Stroid sound perfect.

The aim is to make Stroid understandable enough that a developer can answer three real questions:

1. Is this a fit for my application?
2. Which parts of it should I actually use?
3. What costs am I accepting if I adopt it?

That is a better introduction than hype.
