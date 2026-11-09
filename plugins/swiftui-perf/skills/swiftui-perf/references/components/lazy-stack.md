# LazyVStack / LazyHStack

## Under the hood

These are native SwiftUI containers. They create child views only as they approach the visible region (lazy loading) but **do not reuse views** the way `List` does. Created views tend to stay alive for the lifetime of the container.

They maintain an estimated total content height based on nearby subviews. Large height variance between items or very fast scrolling can cause temporary blank regions while heights are calculated.

They still require a constant number of views per `ForEach` element to stay on the fast path (see [foreach.md](foreach.md)).

## Performance smells

- Same ForEach slow-path issues as List.
- GeometryReader or other layout readers inside items.
- Expensive view initializers or body work (images, formatters) because views are created (and sometimes recreated) more often than in a reuse-based List.
- Unstable identity.

## When to prefer List instead

- Very large collections where cell reuse matters for memory.
- You want built-in swipe actions, selection, separators, etc.
- Scrolling performance on older devices is critical.

Use LazyVStack when you need full control over spacing, background, or non-standard layouts that List makes difficult.

## Evidence to seek

- Memory growth while scrolling (Allocations).
- Body counts for items that have already scrolled off-screen.
- Hitch rate compared with an equivalent List.

## Action plan output

```
### Lazy stack analysis
- H1: no reuse + expensive items → memory / hitch growth → compare with List or lighten rows
```
