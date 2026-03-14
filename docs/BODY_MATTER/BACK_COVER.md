# Back Cover

Stroid is a state management library built around a simple claim: state code should stay readable when the application becomes harder, not only when the demo is small.

This book does not try to sell certainty where there is only tradeoff.
It explains what Stroid does well, where its boundaries are, and why the package was split the way it was.
If a feature is heavy, the book says so.
If a feature is opt-in, the book says so.
If a design choice protects clarity at the cost of a few more bytes, the book says so.

Inside this book you will find:

- the core runtime model
- the split package surface
- async behavior and cache discipline
- sync behavior, conflict handling, and recovery
- the React layer and subscription precision
- runtime tools, admin boundaries, and testing posture

This is not documentation written for marketing screenshots.
It is written for developers who have already learned that the hardest bugs come from code that looked convenient before anyone asked what it would cost later.

There is a psychological comfort in vague abstractions: they let us postpone thinking.
Good documentation should do the opposite.
It should reduce fear by making the real shape of the system visible.

If you want a library explained with hype, this is the wrong book.
If you want a library explained with implementation honesty, this is the right one.
