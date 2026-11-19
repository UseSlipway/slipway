# Slipway implementation

References: Caspia public site and animation module (card width 180, 3:4 ratio, drift 25px/s, scroll boost .75, arc 75%, center zoom .4, hover lift .12, dim .5); supplied Web3 Banking detailed brief (Platform route); supplied Scrolltide Widget Board source (Dashboard route).

Product copy comes from Slipway_Overview.md and Slipway_Backend.md. These are pre-build specifications, not evidence of live infrastructure. Browser-local workspace actions must persist and use real input; no false settlements, balances, API calls, transactions or receipts. No preview/demo/simulation labels in product UI. Signing requires a wallet and actual built transaction. No fabricated quotes.

Brand: near-black oxblood #1b060c, burgundy #4b101d, antique gold #dfb864, champagne #f3e3b8. Preserve reference layout and motion over generic design rules. Social actions open Coming soon dialog. No contact/email/PDF links.

## Shipped pages and behavior

- `/`: Caspia floating-image entrance and orbit (desktop 25 px/s, mobile 15 px/s, stiffness 55, damping 24), followed by KYMA's editorial grid and section sequence. Burgundy/gold branding replaces reference colors. KYMA’s TASA Orbiter and Roboto Mono variable fonts are bundled locally, including actual 700 weight labels.
- `/platform`: self-contained `public/platform-experience.html`, adapted from the first attachment. Two desktop scenes, 3.4 s forward / 1.6 s reverse transition, capability selector, videos, mobile reflow, reduced-motion behavior.
- `/dashboard`: original Widget Board geometry and components with working local workspace records. Launch create/edit/delete, token validation/watchlist, search, chain filtering, activity derived from actual actions, preferences, JSON export, browser-wallet connection. No private keys are collected. Local storage is scoped to the browser origin.
- `/networks`: four-chain explorer with venue families and chain-selected workspace links.
- `/developers`: searchable operation list and wallet custody explanation. The opening integration headline and code editor were removed at the user’s request.
- Native modal for GitHub, Telegram and X: "Coming soon". No email or contact forms.

## Service boundary

The frontend now calls its backend through the same-origin `/api/slipway` Vercel function, with a Vite dev proxy locally. The current backend only exposes health/version and the x402 facilitator; token resolution, quotes, unsigned builds and trade/launch relay still need implementation. Quote ID, output, expiration and chain-compatible wallet are checked when a quote service responds. Unsigned payloads can be downloaded. No invented quotes, balances, confirmations or transactions are shown. This frontend does not sign or submit transactions. API authentication, multi-device synchronization, subscriptions and on-chain activity require additional backend work. Plan choice saves a preference, not a paid subscription.

## Verification

- Production build passed.
- Four API tests passed: chain addresses, quote shape / basis points, secure endpoint validation, request URL and error handling.
- Browser checks at 1280×720, 820×1180 and 390×844.
- Created, edited, searched and removed a temporary launch; verified persistence after reload.
- Invalid token address rejected; valid token saved and removed.
- Missing endpoint correctly stops a quote request.
- Checked platform capability selector and feature transition, social modal, pricing total toggle, FAQs, plan handoff, chain handoff, developer copy and search.
- No horizontal overflow in checked mobile landing, dashboard and developer pages. Transparent logo and local photography load successfully.
- Asset sources and hashes are recorded in ASSETS.md. Stock imagery is distinct within the recorded project selection; worldwide exclusivity cannot be verified.

## Run

`npm install`, `npm run dev`, `npm test`, `npm run build`.
Static output is `dist/`. Postbuild writes route entrypoints for direct navigation. Site identity lives in `.openai/hosting.json`.

## KYMA reconstruction — revision 2

Audited the public deployed Framer modules and the supplied recording. The measured reference values and source module names are in `references/kyma-motion-audit.md`.

- Kept the Caspia hero, with a 5.2-viewport pinned KYMA problem sequence below the introduction. Five reversible states, staged ticker rows, 30px/s motion, pause/drag, .8s state transitions, dark-to-paper change and headline zoom replacement.
- Rebuilt the four-column section geometry and reference typography. Added character accent reveals, reversible scroll ink, decoded section labels, two-layer image wipes, bottom-up metric bars, service hover overlays, interactive staircase ruler, word-revealed quote, spring-revealed audience images, centered integration grid with empty cells, pricing decode, independent animated FAQ rows, rolling links and footer entrances.
- Rebuilt the menu with four bottom-to-top panels, .8s masks staggered 0/.1/.2/.3s, per-letter rolling links, .6s exit and a .755s route curtain. Smooth wheel scrolling uses Lenis duration 1.2; touch remains native. Reduced-motion preferences are respected.
- The dashboard Your wallet tile is one static local photograph. Its orbit, rings, satellites, hover lift and image transitions are removed. All other existing workspace behaviors remain in place.
- 27 distinct photographs occupy 27 distinct placements: 20 landing-page photos, one menu photo, four network photos, one developer photo, and one wallet tile photo. No file is reused between placements. The asset audit checked source IDs against the available prior-project records; worldwide exclusivity is not verifiable.

Revision checks: production build passed; existing four API tests passed; dependency audit reports no vulnerabilities. Browser checked at 1280×720 and 390×844. Verified stable pinned stage, reversible phase changes, four ticker rows, correct process selection, menu panel timings, service media activation, calculator slider/fee toggle, 30/360-day totals and independently opened FAQ answers. Wallet image has computed animation-name none; no wallet orbit elements remain. Checked photo loading, console errors and page-level horizontal overflow. Existing service boundary above still applies.

## Responsive and brand revision — revision 3

- Removed the entire “One integration. Every possibility.” opening section; Developers now starts with the searchable operation workflow.
- Replaced fabricated chain glyphs and typographic ecosystem placeholders with authentic company marks. Original paths/proportions are retained. Gold masks and a gold/cream PancakeSwap palette variant supply Slipway styling; sources and originals are recorded separately.
- Preserved the Caspia hero plus KYMA section order. Fixed the phone integration-grid slot cascade, landscape pinned-stage height and scroll denominator, and ultrawide alignment of the header, chain strip, menu, background lines and footer.
- The dashboard uses a real four/two/one-column layout rather than scaling a 1600px canvas. Text and controls retain readable sizes. Phone fields use 16px text, touch controls gain 44px targets, menus scroll in landscape, and safe-area offsets protect controls. Native dialogs lock background scroll and restore focus.
- All 27 distinct photo placements now use local responsive WebP sources at up to 480/960/1600px with dimensions, async decoding and lazy loading below the fold. The 480px set is approximately 0.69MB versus 10.18MB for the original JPEG set (about 93% smaller). The hero pauses offscreen and in hidden tabs.
- Font weights, label decode timing, price random-burst decode, phone problem-text progression and the three-square button arrow more closely follow the inspected KYMA source. Section anchors settle after local fonts load.
- Copy now says “private keys shared,” “scale your integration,” and “one consistent interface.” Plans list documented capacities. The 360-day toggle is explicitly a calculated cost of twelve 30-day periods, not an annual purchase or discount. Resource links say “Explore Slipway.”

QA uses browser viewport emulation, not a claim of physical testing on every device. The existing service boundary remains unchanged.

Final revision-3 checks: production build and four existing API tests passed. Browser inspected 38 page/viewport combinations (320–2560px), plus the embedded Platform at six sizes. No page-width or heading overflow remained. Verified the static wallet photograph, phone pricing totals, landscape menu scrolling, dialog Escape/focus restoration and direct Platform navigation. The Platform experience file was renamed to avoid `/platform.html` shadowing the `/platform/` app route. Results: `references/revision3-browser-checks.json`.

## Dashboard and Platform fidelity — revision 4

- Integrated the actual GetLayers Nacre shader (`nacre-002`) with pearl white, pale gold and lavender stops. Renderer caps DPR at 1, cleans up its listeners and GL resources, pauses while hidden, and renders a still frame for reduced motion. Dashboard cards, forms and navigation use cream/plum colors for legibility.
- Native select chevrons have a 16px right inset and 44px reserved padding. Widget dropdown chips use 10px spacing and 13px inset.
- Page reveal now waits for responsive photo decoding, company-mask artwork, fonts, and Platform posters. All photo placements load eagerly; navigation intent warms destination images. The landing hero starts after readiness, replacing its fixed 2.8-second timer.
- Rebuilt the Platform compact architecture from the original supplied brief: one fixed compact menu, four-row card showcase, portrait/landscape tablet layouts, two feature columns at 940px, and native-size phone cards. Removed the duplicate outer header and the hero-card emblem. Restored source CTA arrow, key and bolt vectors, SVG gradient rings, exact card and title boxes, distinct reveal blur/scale groups, menu state, viewport-based panel detection and reverse navigation. The original reference's Visa rasters are intentionally not inserted; Slipway cards retain their own information and materials within the reference geometry.
- Platform videos, posters and fonts are now local assets. The two video sources retain the exact supplied animation, with auto preloading and reduced-motion pause behavior.

Verification: production build and four API tests passed. Browser checks covered 320–2560px, including 599/600, 940 and 1199/1200 boundaries. Phone cards retain 18px body text and 6px visual dots; the hero card has no emblem. Checked menu open/close and feature navigation, dropdown selections and launch dialog, image readiness across landing/dashboard, and desktop forward transition. QA uses viewport emulation, not physical-device testing. Existing service boundary is unchanged.
