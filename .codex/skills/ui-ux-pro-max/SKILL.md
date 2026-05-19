# UI UX PRO MAX

Purpose: give future agents a strong default for internal tools and landing pages that need clarity, hierarchy, and operational calm without generic AI-looking UI.

## When to use

- New dashboard or landing page
- Navigation hub for multiple internal apps
- Loading, skeleton, error, and empty state design
- Pages with mixed admin and operator audiences
- Any UI surface that currently feels noisy, flat, or too API-driven

## Principles

1. Design for scan speed first.
2. Keep primary actions obvious in under 3 seconds.
3. Reduce repeated chrome and repeated API-driven spinners.
4. Use strong grouping, not walls of cards.
5. Prefer calm contrast and one clear accent family.
6. Treat error and loading states as first-class UI, not afterthoughts.

## Visual direction

- Avoid generic white-card-on-gray defaults.
- Prefer layered backgrounds, strong section dividers, and clear action hierarchy.
- Typography should feel intentional. Use a non-default stack when external fonts are not guaranteed.
- Use a restrained accent palette. Avoid purple bias.
- Use motion only where it clarifies state change.

## Loading and refresh

- Prefer retained previous data plus sectional skeletons.
- Avoid full-page spinners after first meaningful paint.
- For private internal apps, show `last updated` and explicit refresh controls.
- Default to event-driven invalidation and manual refresh fallback.
- Poll only where there is no practical event source, and throttle aggressively.

## Error treatment

- Redirect to login only on confirmed auth failure.
- Use inline retryable banners for transient data failures.
- Distinguish empty state, stale state, and failed refresh.
- Surface operational context in plain language.

## Landing page pattern

- Top hero with clear purpose and environment label.
- App cards with role, status, entry action, and secondary metadata.
- Separate stable apps from experimental or admin-only tools.
- Make future expansion easy through config-driven card metadata.

## Deliverable standard

When using this skill, agents should produce:

- A clear visual hierarchy
- Non-jarring loading states
- Error states that preserve orientation
- Small number of obvious actions
- Configurable app directory structure for future additions
