# Testing

## How to run

```bash
npm test         # watch mode — reruns on file save (use while developing)
npm run test:run # one-shot run (use in CI / before deploy)
npm run build    # type/JSX/import sanity check (not a behavior test)
```

Stack: **Vitest** + **React Testing Library** (jsdom). Test files live next to
the code they cover, named `*.test.jsx`. Config is in `vite.config.js` (`test`
block); shared setup is `src/test/setup.js`.

## What we test (and what we don't)

This is an internal tool, so we test deliberately, not exhaustively.

**Do unit-test** the deterministic UI logic we actively edit — filtering,
selection, form helpers, SKU/alias resolution, case-size math. It's fast,
stable, and catches the regressions that matter. See `src/components.test.jsx`
for the pattern.

**The rule:** when you change real logic, add or extend a test for it. The
suite grows with the code instead of being written all at once.

**Don't bother auto-testing** the external integrations — Google sign-in,
ShipStation submit, Asana upload, packing-list PDF. Mocking Google/GAS is a lot
of plumbing for little payoff and tends to be brittle. Cover those with the
manual checklist below.

## Manual smoke checklist (run before `npm run deploy`)

- [ ] Sign in with a `@honeydewsleep.com` account; confirm the form loads.
- [ ] Pick a retailer (type to search **and** click from the dropdown).
- [ ] Add a product (search by master SKU **and** by alias SKU).
- [ ] Submit a test order → confirm it lands in ShipStation and the Google Sheet
      logs a row.
- [ ] Download the packing-list PDF → fields populate correctly.
- [ ] Send PL to Asana → task is created in the retailer's section with the PDF
      attached.
