## Acknowledgements

State management in modern applications is often fragmented. Persistence, synchronization, and async caching are typically handled by separate libraries that do not communicate. This results in complex coordination logic that scales poorly.

Stroid was created to address this by providing a single, coherent system where these concerns are integrated by design.

This project is informed by the libraries that defined the space. Zustand demonstrated the power of minimal APIs; Redux showed the importance of predictable state; TanStack Query and SWR established the standards for async lifecycles; and MobX proved that reactivity can be seamless.

Stroid manages the entire state lifecycle—creation, mutation, persistence, synchronization, and async flow—within a unified named-store registry. It treats request isolation and SSR as core architectural requirements rather than optional features.

The named-store model allows stores to be accessible anywhere without complex import chains, making state easier to compose and inspect. While this differs from traditional reference-based patterns, it provides a clear source of truth for complex applications.

Stroid is designed for applications where state management complexity has become a primary bottleneck.

— Himesh Bhattarai