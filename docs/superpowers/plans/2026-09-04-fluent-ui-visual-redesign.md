# Fluent UI Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the visual layer of Agent Compose Nova with Fluent UI tokens and accessible responsive styling while keeping all existing product behavior unchanged.

**Architecture:** Add one Fluent UI provider at the application root and map Fluent semantic tokens into the existing CSS class structure. Preserve every route, component event handler, API call, field, and data model. Update the shared console shell and CSS surfaces so existing screens inherit the new design without a business-logic rewrite.

**Tech Stack:** React 19, TypeScript, Vite, Fluent UI React v9, React Router, React Query, Vitest, Testing Library, native CSS custom properties.

## Global Constraints

- Do not change routes, route labels, route parameters, API clients, query keys, RPC payloads, storage keys, form field order, or confirmation behavior.
- Add only `@fluentui/react-components` as a UI dependency and use it as the sole component-system source.
- Use system light and dark preference through Fluent themes and CSS variables.
- Keep existing Chinese user-facing copy and semantic status colors.
- Use 12px surface radii, one blue interactive accent, WCAG AA contrast, visible focus states, and `prefers-reduced-motion` support.
- Do not use em dash characters in new visible copy.

---

### Task 1: Establish Fluent UI theme infrastructure

**Files:**
- Modify: `package.json`
- Modify: `src/main.tsx`
- Modify: `src/App.tsx`
- Modify: `src/index.css`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: React root in `src/main.tsx` and existing `App` component.
- Produces: a global `FluentProvider` wrapper, an application root surface, and semantic CSS variables available to all existing class-based screens.

- [ ] **Step 1: Write the failing test**

Add this assertion to `src/App.test.tsx` after rendering `App` with the existing mocks:

```tsx
expect(document.querySelector('.acnova-app')).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/App.test.tsx`

Expected: FAIL because the application root does not yet have the `acnova-app` class.

- [ ] **Step 3: Add the dependency and minimal provider implementation**

Run:

```bash
npm install @fluentui/react-components
```

Update `src/main.tsx` to import `FluentProvider`, `webLightTheme`, `webDarkTheme`, and `useState`. Render a local `ThemedRoot` that follows `window.matchMedia('(prefers-color-scheme: dark)')` and wraps `App` in `FluentProvider`. Update `src/App.tsx` so its existing conditional application content is returned inside `<div className="acnova-app">`. Add concise import and theme-selection comments.

Replace `src/index.css` with root-level token aliases and baseline styles. The implementation must map `--ac-*` variables to Fluent variables, set `color-scheme: light dark`, and include:

```css
.acnova-app { min-height: 100dvh; color: var(--ac-text); background: var(--ac-canvas); }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; } }
```

- [ ] **Step 4: Run focused test to verify it passes**

Run: `npm test -- src/App.test.tsx`

Expected: PASS.

- [ ] **Step 5: Run type and component verification**

Run: `npm run build && npm test -- src/App.test.tsx`

Expected: TypeScript build succeeds and the focused test passes.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/main.tsx src/App.tsx src/index.css src/App.test.tsx
git commit -m "feat: add Fluent UI theme foundation"
```

### Task 2: Build the responsive console shell

**Files:**
- Modify: `src/ui/ConsoleLayout.tsx`
- Modify: `src/ui/ConsoleLayout.test.tsx`
- Modify: `src/ui/console.css`

**Interfaces:**
- Consumes: `NAV_ITEMS`, React Router location state, and `AuthOverlay`.
- Produces: a branded `console-layout` with an accessible navigation rail and stable existing routes.

- [ ] **Step 1: Write the failing test**

Add this test to `src/ui/ConsoleLayout.test.tsx`:

```tsx
it('renders the product identity in the navigation rail', () => {
  renderWithClient(<MemoryRouter initialEntries={['/console']}><ConsoleLayout /></MemoryRouter>);
  expect(screen.getByText('Agent Compose')).toBeInTheDocument();
  expect(screen.getByText('本机 AI 工作台')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/ui/ConsoleLayout.test.tsx`

Expected: FAIL because the identity content is absent.

- [ ] **Step 3: Implement the layout structure and styles**

Add a non-interactive brand block above the existing navigation list in `ConsoleLayout.tsx`. Keep all links, labels, and `aria-current` logic unchanged. Add `console-layout__rail`, `console-layout__brand`, `console-layout__brand-name`, `console-layout__brand-subtitle`, and `console-layout__content` classes.

Append CSS that creates a 248px desktop rail, a scrollable content region, an active-link background, and a mobile top navigation at `max-width: 767px`. Use `--ac-*` tokens, 12px radii, and transform-only hover feedback.

- [ ] **Step 4: Run focused test to verify it passes**

Run: `npm test -- src/ui/ConsoleLayout.test.tsx`

Expected: PASS.

- [ ] **Step 5: Run related UI regression tests**

Run: `npm test -- src/ui/ConsoleLayout.test.tsx src/ui/DashboardScreen.test.tsx src/ui/AgentListScreen.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/ConsoleLayout.tsx src/ui/ConsoleLayout.test.tsx src/ui/console.css
git commit -m "feat: redesign console navigation shell"
```

### Task 3: Apply shared console component styling

**Files:**
- Modify: `src/ui/console.css`
- Modify: `src/ui/DashboardScreen.test.tsx`
- Modify: `src/ui/RunsScreen.test.tsx`
- Modify: `src/ui/ResourcesScreen.test.tsx`

**Interfaces:**
- Consumes: existing screen class names and controls.
- Produces: visually consistent page headers, buttons, cards, tabs, tables, dialogs, logs, and status labels without changing component actions.

- [ ] **Step 1: Write the failing tests**

Add lightweight class-contract assertions to the existing screen tests:

```tsx
expect(document.querySelector('.console-page__head')).toBeInTheDocument();
expect(document.querySelector('.runs-table')).toBeInTheDocument();
expect(document.querySelector('.res-tabs')).toBeInTheDocument();
```

Use only a test whose fixture renders the corresponding element. If a fixture lacks it, add the smallest local mocked query result needed to render it.

- [ ] **Step 2: Run tests to verify the new assertions fail where a visual contract is missing**

Run: `npm test -- src/ui/DashboardScreen.test.tsx src/ui/RunsScreen.test.tsx src/ui/ResourcesScreen.test.tsx`

Expected: At least one new assertion fails before its supporting structural class is added. Do not change an existing route or handler to satisfy the test.

- [ ] **Step 3: Implement shared visual rules**

Refactor `console.css` into sections for page frame, buttons, cards, tables, dialogs, badges, tabs, logs, and responsive behavior. Use existing classes and only add non-semantic wrapper classes when a screen lacks a hook for a needed layout.

Required outcomes:

```css
.console-page { width: min(100%, 1240px); margin: 0 auto; padding: 36px 40px 56px; }
.setup-btn { min-height: 36px; border-radius: 8px; font-weight: 600; }
.dash-card, .agent-card, .res-section, .set-block, .run-section { border: 1px solid var(--ac-border); background: var(--ac-surface); box-shadow: var(--ac-shadow-2); }
```

Keep run-state colors semantic, give logs an elevated neutral terminal surface, and make overflow-prone tables scroll horizontally on mobile.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `npm test -- src/ui/DashboardScreen.test.tsx src/ui/RunsScreen.test.tsx src/ui/ResourcesScreen.test.tsx`

Expected: PASS.

- [ ] **Step 5: Run all console-screen tests**

Run: `npm test -- src/ui`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/console.css src/ui/DashboardScreen.test.tsx src/ui/RunsScreen.test.tsx src/ui/ResourcesScreen.test.tsx
git commit -m "feat: unify console visual components"
```

### Task 4: Redesign setup and wizard flows

**Files:**
- Modify: `src/ui/setup.css`
- Modify: `src/ui/SetupShell.tsx`
- Modify: `src/ui/CreateWizard.tsx`
- Modify: `src/ui/SetupShell.test.tsx`
- Modify: `src/ui/CreateWizard.test.tsx`

**Interfaces:**
- Consumes: existing wizard steps, callbacks, and draft model.
- Produces: a responsive guided-flow presentation while preserving step order and callbacks.

- [ ] **Step 1: Write the failing tests**

Add assertions for the new non-behavioral layout hooks:

```tsx
expect(document.querySelector('.setup-shell__panel')).toBeInTheDocument();
expect(document.querySelector('.wizard-shell__panel')).toBeInTheDocument();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/ui/SetupShell.test.tsx src/ui/CreateWizard.test.tsx`

Expected: FAIL because the panel wrappers do not exist.

- [ ] **Step 3: Implement wrappers and guided-flow styles**

Wrap each existing wizard body in the named presentation wrapper without moving callbacks or changing conditional-step logic. Expand `setup.css` with a two-layer background, readable progress states, card-like selection controls, accessible form focus states, and a single-column mobile layout. Keep button labels and all form names unchanged.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `npm test -- src/ui/SetupShell.test.tsx src/ui/CreateWizard.test.tsx`

Expected: PASS.

- [ ] **Step 5: Run all wizard tests**

Run: `npm test -- src/ui/SetupShell.test.tsx src/ui/CreateWizard.test.tsx src/ui/steps`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/setup.css src/ui/SetupShell.tsx src/ui/CreateWizard.tsx src/ui/SetupShell.test.tsx src/ui/CreateWizard.test.tsx
git commit -m "feat: redesign setup and agent wizard"
```

### Task 5: Verify visual and functional regressions

**Files:**
- Modify: `docs/superpowers/specs/2026-09-04-agent-compose-ui-fluent-redesign-design.md`

**Interfaces:**
- Consumes: completed theme, layout, and screen changes.
- Produces: verified implementation evidence recorded in the design specification.

- [ ] **Step 1: Run full automated verification**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 2: Perform browser verification**

Inspect `http://127.0.0.1:5173/` at desktop and a 390px mobile viewport. Check setup and console routes, active navigation, primary and ghost buttons, empty states, dialogs, a run detail log, and table overflow. Repeat using both system light and dark color schemes.

- [ ] **Step 3: Record verification outcomes**

Append a `## Verification` section to the design specification listing exact automated command results and manual routes checked. Do not claim a route was checked if it was unavailable from the current daemon state.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-04-agent-compose-ui-fluent-redesign-design.md
git commit -m "docs: record UI redesign verification"
```
