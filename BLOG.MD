**From - Himesh Chanchal Bhattarai**

## Why I Built Stroid

I did not build Stroid for hype, fame, money, or some "bro I made a framework" moment.

I built it because I was tired. Not fake-deep tired. Real developer tired.

The kind of tired that comes from repeating the same patterns in project after project:

- state setup
- middleware logic
- async handling
- persistence
- sync
- error handling
- weird edge-case debugging

And yeah, there are already amazing tools out there. I know that. I respect that. This is not me acting like nothing existed before Stroid.

The problem was not "nothing exists."
The problem was "I still keep feeling the same pain even when good tools exist."

That pain is where Stroid started.

## The Original Idea Was Way Smaller

The funny part is that I did not start with some huge master plan.

At first I literally just wanted:

- `createStore()`
- `setStore()`
- `getStore()`

That was the vibe.
Just three functions.
Just enough for my side project.
Just enough to make life easier.

But bugs have a way of disrespecting simple plans.

One small problem leads to another.
One fix exposes another weakness.
One edge case makes you realize the thing that "works" only works in the easy path.

And slowly, if you keep pushing, a tiny utility turns into an actual system.

That is what happened here.

## Why This Project Became Personal

As a solo developer, repeated friction hits different.

When you are alone, every architecture decision, every bug, every ugly workaround, every repeated setup lands directly on you. There is no one to hide behind. No team process to absorb the mess. No clean separation between "product work" and "plumbing work."

So I started asking myself:

Why am I rebuilding the same support code every time?
Why does state management always drag extra patterns with it?
Why does so much effort go into keeping the system stable instead of building the actual thing I wanted to build?

That question stayed in my head for a while.

And eventually it became Stroid.

## I Did Not Start As a Package Expert

I need to be honest about that too.

I had around 3 years of JavaScript and framework experience, but package-building is different. It is stricter. A lot stricter.

In an app, you can get away with things.
In a package, every shortcut becomes a public API problem later.
Every assumption becomes somebody else’s production bug.
Every tiny hidden behavior matters more than you think.

So the beginning was not really "build."
The beginning was:

- research
- reading
- architecture notes
- stopping
- starting again
- asking better questions

I wrote structure in one file.
Then I made the first real file.
Then I stopped.
Then I researched again.
Then I asked AI how certain parts could be approached.
Then I built again.

That loop happened a lot.

## How I Actually Use AI

AI helped a lot, no point pretending otherwise.

But AI did not build this alone, and it definitely did not make the real decisions.

What AI did for me was:

- speed up exploration
- generate implementation directions
- help review code
- help hunt bugs
- help pressure-test edge cases
- help think about production behavior

But I never treated AI output like instant truth.

The part I kept under my control was the most important part:

- Is this bug real?
- Does this fix actually solve the problem?
- Does this match the architecture?
- Is this code worth merging?
- Is this a real improvement or just noise?

That matters a lot to me.

Because I do not want AI to replace judgment.
I want it to amplify judgment.

That is the difference.

## What My Prompting Style Says About Me

One thing I realized while building this is that prompting style says a lot about the person behind it.

And honestly, my prompts are not "just give me code" prompts.

Even when my wording is messy, the direction is pretty consistent.
I keep coming back to:

- hidden bugs
- edge cases
- production failures
- regressions
- architecture
- timing issues
- what still breaks even if tests pass

That means I am not really chasing output.
I am chasing pressure.

I want the answer tested.
I want the fix stressed.
I want the edge case exposed.
I want the weak assumption dragged into the light.

From that side, I think my real strength is not "perfect prompting."
It is that I keep pushing toward the truth of the system.

That matters more than polished wording.

## Why "What’s Behind It?" Motivates Me

This might be the biggest thing I learned while building Stroid.

A lot of people use things like:

- `try/catch`
- `async/await`
- subscriptions
- persistence
- state updates

And if it works, they move on.

That is normal.
That is human.

Most people do not ask what is behind the thing once the thing works.

If `try/catch` catches, they move on.
If `async/await` resolves, they move on.
If state updates correctly, they move on.

But I realized I am weirdly motivated by the opposite.

When something works, I want to know what is under it.

Not in a fake intellectual way.
In a builder way.

Like:

- why does this actually work?
- what is the real boundary here?
- what hidden assumption is carrying this behavior?
- what breaks if the timing changes?
- what fails if the system is under pressure?

That backward step is motivating to me.

Most people see a working feature and step forward.
I usually see a working feature and step backward first.

I want to know what the feature is standing on.

## What I Found Behind the "Working" Stuff

I found that `try/catch` works, but behind it the important thing is not the syntax. The important thing is the boundary.

`try/catch` only protects the code that actually runs inside that protected flow. If the failure happens later, elsewhere, or in another async turn, that `catch` may never even see it. So the real lesson is not "I wrapped it." The real lesson is "do I actually own the failure boundary here?"

I found that `async/await` works, but behind it there is timing.

People say `async/await` makes code look synchronous, and yeah, it does. But underneath that clean syntax is pausing, resuming, scheduling, and a whole gap where reality can change. Another request can win. A store can be deleted. A retry can start. State can go stale. So behind `await`, there is always timing risk.

I found that subscriptions work, but behind them there is a hidden contract between mutation and notification.

Most people only see "state changed, subscriber fired." But the real questions are: when was it queued, what snapshot did it receive, can another update happen while this one is notifying, and can a listener accidentally touch live state? That gap between update and notification is where some nasty bugs live.

I found that persistence works, but behind it there is delay.

Saving state sounds simple until you ask: when is the write actually happening? What if the store is deleted before the save runs? What if memory is reset but storage still holds stale data? What if serialization changes the actual value? Persistence is not only storage. It is truth moving across time, and late truth can become wrong truth.

I found that sync works, but behind it there is message ordering.

Cross-tab sync sounds easy until you deal with late messages, deleted stores, stale channels, reconnects, and two contexts disagreeing on what is newer. At that point, sync is not just "send/receive." It becomes a question of ownership, ordering, and whether cleanup really happened.

I found that tiny helpers matter way more than they look.

A helper can be five lines and still leak a live reference, hide a shallow clone, or quietly break assumptions everywhere. Small helpers are dangerous because people trust them faster. When they are wrong, the bug spreads quietly through the whole system.

And I found that a fix is never just a fix.

A fix can solve one issue and create another. It can change timing, change behavior, or break a hidden guarantee. So now I do not think "the test passed, we are done." I think "what did this fix change around itself?"

That mindset changed how I build.

## What This Project Taught Me About Myself

Stroid showed me that I am not satisfied by surface-level success.

If something works but feels structurally wrong, I keep digging.
If a bug looks small but hints at a deeper design weakness, I keep following it.
If the behavior is technically valid but fragile, I do not feel calm about it.

That is probably why this project grew so much.

I did not grow it because I wanted to flex.
I grew it because every bug kept asking a more serious question.
I do not just want an answer. I want pressure on the answer

And I kept answering it.

That tells me I care a lot about:

- consistency
- architecture
- production behavior
- hidden assumptions
- trustworthiness under pressure

I am not interested in systems that only look clean.
I am interested in systems that still hold when things get weird.

## Where I Messed Up Too

I also need to admit this:

I definitely misused AI sometimes.

There were moments where I pushed too many ideas too fast, too emotionally:

"add this too"
"support this"
"fix that also"
"why not this?"

And yeah, that created overengineering in some places.

I can see that now.

So the project is not only about building more anymore.
Now it is also about cutting better.

That means:

- splitting what is too heavy
- removing what does not earn its place
- improving type safety
- making debugging cleaner
- reducing architectural mess
- focusing on what actually deserves to stay

That is also why sub-imports matter to me now. It is not only a bundle-size thing. It is a clarity thing.

## What Kind of Builder I Think I Am

If I had to describe myself through this project, I think I am this kind of builder:

- pain-driven more than trend-driven
- stubborn when something feels fake-stable
- curious enough to keep researching what I do not fully understand yet
- comfortable using AI heavily, but not comfortable giving it final authority
- more interested in real system strength than pretty demos
- the kind of person who can start small and become serious through consistency

I do not think I started this as an expert.
I think I started it as someone annoyed enough to keep going.

And lowkey, that matters.

## Where I Am Now

Right now, I feel like the roadmap and direction are finally becoming more intentional.

I do not want Stroid to become bigger just because it can.
I want it to become better because it should.

Versions like `v0.0.6` and `v0.0.7` matter to me for that reason.

Not because I want random expansion.
But because I want:

- better structure
- better safety
- better type accuracy
- better debugging
- better trust

So this is where I am now:

I started with pain.
I stayed because of curiosity.
I kept going because bugs kept teaching me what the library needed to become.

And maybe that is the cleanest way to say what Stroid really is:

It is not just something I built.
It is something I refused to leave half-understood.
