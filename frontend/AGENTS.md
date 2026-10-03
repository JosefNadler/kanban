# Frontend code guide

This document describes the current frontend-only implementation in [frontend/](/home/josef/Projects/pm/frontend).

## Stack

- Next.js (App Router) with React and TypeScript
- Tailwind CSS v4
- dnd-kit for drag and drop
- Vitest + Testing Library for unit tests
- Playwright for end-to-end tests

## Entry points

- [src/app/layout.tsx](/home/josef/Projects/pm/frontend/src/app/layout.tsx): root layout, fonts, metadata, and global CSS import.
- [src/app/page.tsx](/home/josef/Projects/pm/frontend/src/app/page.tsx): renders the app shell.
- [src/app/globals.css](/home/josef/Projects/pm/frontend/src/app/globals.css): app-wide styles and color variables.

## Main UI components

- [src/components/AppShell.tsx](/home/josef/Projects/pm/frontend/src/components/AppShell.tsx)
  - login gate shown before board access
  - hardcoded credential check (`user` / `password`)
  - localStorage-backed auth session (`pm-authenticated`)
  - logout action that clears auth and returns to sign-in
- [src/components/KanbanBoard.tsx](/home/josef/Projects/pm/frontend/src/components/KanbanBoard.tsx)
  - owns in-memory board state
  - wires drag-and-drop context
  - handles column rename, add card, delete card, and move card
  - renders five columns from board data
- [src/components/KanbanColumn.tsx](/home/josef/Projects/pm/frontend/src/components/KanbanColumn.tsx)
  - droppable column surface
  - editable column title input
  - sortable list of cards
  - embeds new card form
- [src/components/KanbanCard.tsx](/home/josef/Projects/pm/frontend/src/components/KanbanCard.tsx)
  - draggable card item with title/details and remove action
- [src/components/NewCardForm.tsx](/home/josef/Projects/pm/frontend/src/components/NewCardForm.tsx)
  - toggleable add-card form
  - requires non-empty title
  - optional details
- [src/components/KanbanCardPreview.tsx](/home/josef/Projects/pm/frontend/src/components/KanbanCardPreview.tsx)
  - drag overlay preview for active card

## Data model and board logic

- [src/lib/kanban.ts](/home/josef/Projects/pm/frontend/src/lib/kanban.ts)
  - defines `Card`, `Column`, and `BoardData` types
  - provides seeded `initialData` with 5 columns and sample cards
  - provides `moveCard` helper used by drag-and-drop handlers
  - provides `createId` helper for new card IDs

Current persistence behavior: none. The board is reset from `initialData` on every page reload.

## Tests

- Unit/component tests:
  - [src/components/AppShell.test.tsx](/home/josef/Projects/pm/frontend/src/components/AppShell.test.tsx)
  - [src/components/KanbanBoard.test.tsx](/home/josef/Projects/pm/frontend/src/components/KanbanBoard.test.tsx)
  - [src/lib/kanban.test.ts](/home/josef/Projects/pm/frontend/src/lib/kanban.test.ts)
- Test setup:
  - [src/test/setup.ts](/home/josef/Projects/pm/frontend/src/test/setup.ts)
  - [vitest.config.ts](/home/josef/Projects/pm/frontend/vitest.config.ts)
- End-to-end tests:
  - [tests/kanban.spec.ts](/home/josef/Projects/pm/frontend/tests/kanban.spec.ts)
  - [playwright.config.ts](/home/josef/Projects/pm/frontend/playwright.config.ts)

## NPM scripts

Defined in [package.json](/home/josef/Projects/pm/frontend/package.json):

- `npm run dev`: start Next.js dev server
- `npm run build`: production build
- `npm run start`: run production server
- `npm run lint`: lint source
- `npm run test` / `npm run test:unit`: run unit tests
- `npm run test:e2e`: run Playwright tests
- `npm run test:all`: run unit and e2e tests

## Notes for upcoming integration work

- The app currently assumes a browser runtime (`"use client"` in board component).
- Drag-and-drop behavior relies on card IDs and column IDs from the shared board shape.
- `data-testid` attributes on columns/cards are used by tests and should be preserved or updated alongside tests.
