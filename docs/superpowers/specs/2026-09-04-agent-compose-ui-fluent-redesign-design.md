# Agent Compose Nova Fluent UI Redesign

## Design read

This is a preserve-mode redesign of a local AI assistant control console for non-technical users. It should feel trustworthy, direct, and calm, using Fluent UI as the component and token foundation.

Design dials:

- `DESIGN_VARIANCE`: 3. The product is a task-oriented console, so layouts should be predictable.
- `MOTION_INTENSITY`: 3. Hover, focus, and press feedback only. No decorative or continuous motion.
- `VISUAL_DENSITY`: 6. Operational data remains easy to scan without becoming a crowded cockpit.

## Scope and invariants

The redesign changes presentation only. These items must remain unchanged:

- Routes, route parameters, navigation destinations, and route labels.
- ConnectRPC clients, request payloads, React Query keys, streaming behavior, and local storage keys.
- Form fields, labels, validation behavior, save and delete semantics, and confirmation flows.
- Existing Chinese copy except where a visual control needs an accessible label that already has an equivalent visible label.
- Existing test intent and the public behavior asserted by the Vitest suite.

## Design system

Use `@fluentui/react-components` as the only component system added by this work. It provides tokens, accessible controls, and a responsive foundation suitable for a product console.

Theme strategy:

- Use Fluent tokens inside `FluentProvider`.
- Follow the operating system color scheme with light and dark themes.
- Keep a single blue accent for primary actions and interactive focus states.
- Use semantic status colors only for actual run, scheduler, and connection state.
- Use a 12px radius for surfaces and controls, with compact pill badges only for status.

## Layout and component plan

### Application shell

- Desktop: fixed left navigation rail, product identity at the top, and scrollable content area.
- Mobile: top application bar with horizontally scrollable navigation, preserving all existing destinations.
- Add a restrained page background, content max width, consistent headings, and a visible active navigation state.

### Shared controls

- Convert existing action, secondary, destructive, and text buttons to Fluent button variants without changing their event handlers.
- Convert blocking overlays to Fluent dialogs while preserving existing confirmation copy and actions.
- Apply Fluent input, select, textarea, checkbox, radio, tab, and details-adjacent styling through shared CSS where the current markup must stay intact.
- Provide visible keyboard focus rings and high-contrast disabled states.

### Screens

- Setup and create wizards: make step indicators, card choices, advanced sections, and forms read as a single guided flow.
- Dashboard: elevate the live status and metric hierarchy without introducing fake data or changing dashboard subscriptions.
- Agents, runs, resources, and settings: use consistent page headers, toolbars, tables, empty states, and bounded content surfaces.
- Run detail: retain the log viewer and event timeline behavior while improving scanning, filters, controls, and terminal-state emphasis.

## Responsive and accessibility behavior

- At widths below 768px, the side rail becomes a compact top navigation and content uses 16px side padding.
- Tables retain their existing content and become horizontally scrollable rather than losing columns.
- All colors must meet WCAG AA contrast for text and controls in both system themes.
- Reduced-motion users receive immediate state changes with no transitions beyond essential browser feedback.

## Verification

- Run the existing Vitest suite, lint, and production build.
- Manually inspect the setup flow, dashboard, agents, create wizard, runs, resources, and settings at desktop and mobile widths.
- Check both light and dark system themes, keyboard focus, dialog actions, and destructive-action confirmation paths.
