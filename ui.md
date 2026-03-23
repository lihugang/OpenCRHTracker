# OpenCRHTracker UI Design Guideline

## 1. Document Purpose

This document defines the UI design language for OpenCRHTracker and replaces the earlier prompt-style draft. It is intended for:

- page design and refactor
- shared component design
- AI-assisted component generation
- visual consistency review

This document follows the current implementation in `pages/auth.vue`, `pages/index.vue`, `pages/emu/[code].vue`, `components/lookup/*`, `components/ui/*`, and `assets/css/tailwind.css`.

If a future implementation conflicts with this document, either:

1. update the implementation to match this document, or
2. update this document together with the implementation change

Do not introduce a parallel visual language.

## 2. Design Direction

### 2.1 Core Metaphor

The product should feel like a modern CRH information terminal:

- precise
- calm
- airy
- structured
- highly legible

This is not a flashy dashboard and not a consumer entertainment interface.

### 2.2 Visual Personality

The overall tone is:

- light industrial
- data-oriented
- clean and spacious
- brand-aware but restrained

The UI should suggest railway operations, dispatch systems, and ticket-like information panels without becoming skeuomorphic.

### 2.3 Core Expression

The core expression of the system is:

- light blue-grey atmospheric background
- white or near-white information cards
- CRH blue as the single primary accent
- strong information hierarchy
- restrained motion
- large rounded geometry for panels and controls

## 3. Design Principles

### 3.1 Clarity First

The interface must always prioritize scanability over decoration. Users should be able to quickly identify:

- what to input
- what is the primary action
- what the current state is
- where the result appears

### 3.2 One Accent System

Use `crh-blue` as the primary accent across:

- buttons
- focus states
- accent bars
- highlighted codes
- active emphasis

Avoid introducing extra brand colors for parallel emphasis.

### 3.3 Cards Are the Main Surface

Most important content should live inside cards. Cards are the main visual container for:

- search
- forms
- result tables
- empty states
- supporting panels

### 3.4 Motion Must Be Functional

Motion is allowed only when it improves orientation:

- page transition
- panel switch
- suggestion reveal
- sticky header collapse
- skeleton loading

Do not add decorative motion that does not help comprehension.

### 3.5 Responsive Behavior Is Part of the Design

Desktop and mobile layouts are both first-class. A component is not complete until both are considered.

## 4. Design Tokens

### 4.1 Color Tokens

Use the following semantic palette:

| Token | Value | Usage |
| --- | --- | --- |
| `crh-white` | `#FFFFFF` | cards, elevated surfaces |
| `crh-blue` | `#00529B` | primary action, active state, focus, accent |
| `crh-silver` | `#A9AFB6` | low-emphasis UI details |
| `crh-slate` | `#F8FAFC` | page background |
| `crh-grey-dark` | `#334155` | headings, primary text |
| `status-running` | `#10B981` | success, active running state |
| `status-delayed` | `#EF4444` | error, danger, failed state |

Additional neutral values already used in the codebase such as `slate-400`, `slate-500`, and `slate-600` are valid supporting colors for secondary text and borders.

### 4.2 Color Rules

- Use `crh-grey-dark` for most readable text.
- Use muted slate tones for descriptions, labels, and supporting metadata.
- Use red only for error or failure.
- Use green only for success or running-state semantics.
- Do not use purple, neon gradients, or overly saturated secondary accents.

### 4.3 Typography

Primary fonts:

- sans-serif: `Inter`, `Source Han Sans SC`, `SF Pro Display`, `Segoe UI`, `PingFang SC`, `Microsoft YaHei UI`, `system-ui`, `sans-serif`
- mono: `JetBrains Mono`, `SFMono-Regular`, `Roboto Mono`, `Cascadia Mono`, `ui-monospace`, `monospace`

Usage rules:

- page titles and card headings use sans-serif
- train codes, EMU codes, timestamps, and system-like values use mono where emphasis helps scanning
- eyebrow labels use uppercase with expanded tracking
- large text should be semibold rather than bold-heavy
- Chinese labels and helper headings should prefer medium before semibold

### 4.4 Typography Scale Guidance

- eyebrow: `text-xs`, uppercase, semibold, tracking around `0.24em - 0.3em`
- section title: `text-2xl`, semibold
- large hero title: `text-2xl` to `text-3xl`
- body description: `text-sm` to `text-base`, muted color, comfortable line-height
- data values: `text-sm` with mono when needed
- helper and validation text: `text-xs`

### 4.5 Radius

This system does not use sharp rectangles and does not rely on full pill geometry everywhere.

Preferred radius system:

- major card: `1.25rem`
- nested container: `1rem`
- button: `rounded-2xl`
- input: `1rem`
- chips and badges: `rounded-full`

Do not force all inputs and buttons to `rounded-full`. The current product language uses large soft corners, not strict pills.

### 4.6 Shadows

Shadows should stay soft and low-contrast. They should suggest elevation without heavy floating.

Preferred behavior:

- base card shadow is subtle
- hover shadow slightly increases depth
- strong shadows are reserved for overlays such as suggestion menus

### 4.7 Borders

Use light borders to define structure:

- regular cards and tables: subtle solid borders
- helper/status containers: dashed borders are allowed
- focus and active states should not rely on border alone; combine with glow or ring where appropriate

### 4.8 Motion Timing

Preferred motion ranges:

- micro transitions: `180ms - 220ms`
- layout or panel transitions: up to `320ms`
- easing: mostly `ease-out`

Use small movement only:

- `translateY(8px - 12px)`
- `translateX(6px)`
- opacity fade

Always keep `prefers-reduced-motion` compatibility for meaningful animated transitions.

## 5. Page Shell Rules

### 5.1 App Background

Pages should not use a flat solid background alone. The base shell should combine:

- a very light page gradient
- a top radial glow
- optional soft horizontal glow layer

The effect must remain subtle and low-opacity.

### 5.2 Width and Alignment

Main content should be centered using a shared content width similar to `max-w-7xl`.

Common shell behavior:

- horizontally centered
- generous horizontal padding
- enough vertical breathing room
- consistent gap rhythm between sections

### 5.3 Footer Placement

Pages should be built as `min-h-screen` vertical shells so the footer sits naturally at the bottom.

## 6. Layout Patterns

### 6.1 Single-Panel Centered Layout

Use for focused tasks such as auth:

- vertically centered or near-centered main content
- one dominant action card
- minimal supporting content

### 6.2 Split Search-and-Result Layout

Use for detail pages:

- left column for search or navigation
- right column for results
- on wide landscape screens, the left side can become sticky

### 6.3 Progressive Split Preview

The homepage supports a transitional split behavior on wider screens:

- initial state centers the hero search
- after submit, a preview panel can appear
- the user is then routed into full details

This behavior should remain lightweight and should not become a heavy multi-step wizard.

### 6.4 Mobile Sticky Search Pattern

On smaller screens with enough scrollable content:

- the search card may become sticky
- the card may collapse into a denser form
- the result list should remain visually primary

This is an approved pattern for lookup pages.

## 7. Surface and Card System

### 7.1 Card Philosophy

Cards are the main structural unit. Every important block should feel like it belongs to the same family.

Common card properties:

- light background
- soft border
- large radius
- subtle shadow
- smooth hover shadow increase

### 7.2 Card Variants

#### `default`

Use for neutral content blocks.

#### `accent`

Use for:

- hero search
- auth panel
- primary feature entry

Visual behavior:

- slightly richer background treatment
- more visual prominence
- allowed to carry accent atmosphere and richer gradients

#### `subtle`

Use for:

- secondary content
- mobile result cards
- quick links
- lightweight support panels

### 7.3 Accent Bar

Accent bars are part of the system language. Use them to imply importance, identity, or active framing.

Rules:

- use a vertical blue accent bar on appropriate cards
- implement it as a refined inset treatment, not a crude default border
- do not place accent bars on every card

### 7.4 Internal Card Rhythm

Typical card content structure:

1. eyebrow
2. title
3. optional description
4. divider
5. main action or data
6. optional supporting text

### 7.5 Dividers

Preferred divider styles:

- a soft 1px border for dense structural separation
- a horizontal blue-tinted gradient divider for section emphasis

Do not overuse heavy separators.

## 8. Inputs and Form Controls

### 8.1 Input Style

All text inputs should follow the shared `harmony-input` language:

- white or near-white background
- soft border
- large radius
- subtle inset shadow
- clear blue focus ring
- text-entry controls should use at least `16px` font size to avoid iOS Safari focus zoom

### 8.2 Focus State

Focused inputs should:

- change border to blue
- slightly brighten background
- show a soft outer ring
- remain visually calm and precise

Avoid harsh native focus outlines unless needed as fallback.

### 8.3 Error State

Input errors should be communicated inline and locally:

- red border override where necessary
- concise helper text below input
- keep the layout stable

### 8.4 Labels

Labels should be visible in standard forms. In compact collapsed layouts, labels may be visually hidden if context remains obvious.

### 8.5 Input Density

Default input density should feel spacious. Compact forms may reduce vertical padding slightly, but should preserve the same geometry and hierarchy.

## 9. Button System

### 9.1 Primary Button

The primary button is:

- blue gradient background
- white text
- medium emphasis shadow
- large rounded geometry

Use it for the main page action only.

### 9.2 Secondary Button

The secondary button is:

- white background
- blue text
- subtle border
- light hover tint

### 9.3 Ghost Button

Use for the lowest emphasis actions:

- transparent background
- blue text
- gentle hover background

### 9.4 Loading and Disabled

Buttons should support:

- loading spinner inline
- disabled opacity reduction
- disabled pointer lock

Do not replace the button with a skeleton for standard action loading.

## 10. Search Experience

### 10.1 Search Card

The lookup search card is the signature component of the product. It may include:

- eyebrow
- title
- description
- large input
- strong submit action
- optional type hinting
- suggestions dropdown

### 10.2 Background Treatment

The hero lookup card may use:

- richer gradients than ordinary cards
- subtle image-backed atmosphere
- masked overlays for readability

This treatment is allowed only on the primary search card and should remain restrained.

### 10.3 Suggestion Menu

The suggestion dropdown should feel elevated but attached:

- rounded corners
- clear border
- stronger shadow than base cards
- soft blur is acceptable
- active item uses blue-tinted highlight

### 10.4 Suggestion Item Content

Suggestion items may contain:

- code
- subtitle
- tags

The code is the strongest datum. Tags should stay lightweight and compact.

## 11. Data Display Rules

### 11.1 Desktop Table Style

Desktop result tables should be:

- horizontally stable
- lightly bordered
- minimal vertical noise
- generously padded
- visually readable at a glance

Header rules:

- muted text
- smaller size than body data
- uppercase when appropriate

### 11.2 Row Hover

Hover should gently tint the row background. The effect should support scanning, not dominate the table.

### 11.3 Mobile Card Conversion

The same dataset should be re-expressed on mobile as cards rather than forcing a compressed table.

Mobile result cards should:

- preserve date and code prominence
- present route information in paired blocks
- preserve time data with mono styling

### 11.4 Running State Highlight

Active or running records may receive stronger highlight styling:

- slightly richer blue-cyan surface
- more pronounced border
- subtle visual distinction from standard records

This is an approved exception to the otherwise restrained palette.

## 12. Status, Feedback, and Empty States

### 12.1 Loading

Prefer skeleton loading for structured result areas.

Loading indicators should:

- keep the future layout recognizable
- avoid jumpy reflow
- feel lightweight

### 12.2 Empty State

Empty states should be shown inside the same content surface rather than replacing the entire page shell.

They should include:

- small eyebrow
- clear title
- short explanation

### 12.3 Error State

Errors should be specific and local when possible:

- inline validation for form issues
- card-contained error states for result failures
- local retry action when additional data can be fetched again

### 12.4 Success State

Success should be calm and brief. Use green sparingly and avoid celebratory visuals.

## 13. Responsive Rules

### 13.1 Breakpoint Philosophy

The design is not just scaled down desktop UI. Components may change structure between desktop and mobile.

### 13.2 Approved Responsive Transformations

Allowed transformations include:

- two-column to one-column layout
- sticky search module
- collapsed search header
- table to stacked card conversion
- shorter descriptions on compact surfaces

### 13.3 Content Priority

When screen space becomes limited, preserve in this order:

1. primary action
2. user input
3. result identity
4. key timestamps and station data
5. secondary description

## 14. Motion Rules

### 14.1 Approved Motions

Use motion for:

- route/page transition
- auth mode switch
- preview reveal
- sticky header collapse
- suggestion menu appearance

### 14.2 Motion Style

Motion should feel:

- quick
- smooth
- subtle
- non-bouncy

Avoid spring-heavy or playful animation styles.

### 14.3 Reduced Motion

Whenever a custom transition is introduced, provide a reduced-motion fallback that removes spatial movement where possible.

## 15. Content and Copy Presentation

### 15.1 Eyebrow Usage

Eyebrows should be short, categorical, and scannable, such as:

- `ACCESS`
- `OpenCRHTracker`
- `RECENT RECORDS`
- `Quick Lookup`

### 15.2 Copy Tone

Product copy should be:

- concise
- operational
- informative
- non-promotional

### 15.3 Data Over Description

When layout becomes tight, preserve concrete data before descriptive prose.

## 16. Do and Do Not

### 16.1 Do

- use large, soft-rounded cards
- keep backgrounds bright and airy
- use CRH blue as the primary emphasis color
- use mono for train codes and times where it improves scanning
- design mobile layouts intentionally
- keep visual density controlled
- use local states instead of global intrusive overlays

### 16.2 Do Not

- do not introduce a second strong brand color
- do not switch to dark mode styling by default for new pages
- do not use flat pure-white-on-pure-white layouts without atmospheric depth
- do not replace the card system with bare panels or generic admin tables
- do not use overly sharp corners
- do not use oversized shadows or glassmorphism-heavy effects
- do not force all controls into pill shape if the existing system uses rounded rectangles
- do not add decorative motion that slows task completion

## 17. Implementation Notes

When implementing new UI in this project:

- prefer existing shared components first
- prefer existing design tokens and utility classes
- extend `UiCard`, `UiButton`, and shared lookup patterns before inventing new primitives
- keep new pages visually compatible with `auth`, `index`, and lookup detail pages

If a new visual pattern is necessary, add it deliberately and update this document in the same change.
