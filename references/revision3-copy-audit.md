# Revision 3: Slipway copy and responsive audit

Read-only audit, 17 November 2026. Snapshot: `src/KymaSections.jsx`, `src/KymaMotion.jsx`, `src/App.jsx`, `src/kyma.css`, `src/style.css`, and `src/styles/reference-fonts.css` before the revision-3 changes. Sources of product truth are the supplied Slipway Overview and Backend documents. Reference geometry comes from the downloaded KYMA public modules and `kyma-motion-audit.md`; no new external product claims were researched. This is a source audit, not a claim of rendered pixel matching.

## Copy changes worth making

| Location | Current wording | Recommended correction / reason |
|---|---|---|
| Introduction metrics, `KymaSections.jsx:18` | `0 PRIVATE KEYS REQUIRED` | `0 PRIVATE KEYS SHARED`. Users still require wallet signing keys. This agrees with the later principles section. |
| Pricing, line 69 | `BUILD WITHOUT LIMITS` | `SCALE YOUR INTEGRATION` or `GROW WITH YOUR PRODUCT`. The supplied docs explicitly define rate limits. |
| Pricing | 30-day / 360-day switch; yearly price = monthly × 12 | **30 days is supported** by Backend §12.4, line 1002. Overview calls it monthly. The 360-day purchase/annual offer is not specified. Retain 30-day billing and avoid presenting an invented annual purchase option. |
| Pricing | `Per workspace` | Replace with `Anonymous plan key`, or omit the unit. The docs sell anonymous plan keys, not workspace licenses. |
| Pricing benefits | Generic promises obscure the actual differences | Builder: 50 requests/s, 100 webhook subscriptions. Scale: 200 requests/s, unlimited webhook subscriptions, priority submission. Keyless: 5 requests/s per IP, free transaction building, 3 webhook subscriptions. Overview lines 135–145; Backend §12.4 and §16. |
| Networks, `App.jsx` | Solana: `One instruction format` | `One consistent interface`. Slipway normalizes its API/SDK response, not every chain's native instruction format. |
| Feature, line 60 | `ONE TOKEN. EVERY PHASE.` with a mandatory curve→graduation→pool sequence | Prefer `FROM CURVE TO POOL.` The documents include instant-liquidity venues as well as bonding curves; the diagram is a supported lifecycle, not every token's lifecycle. |
| Closing / footer / introduction | `EVERY CHAIN` | Broad brand language, but actual supported coverage is four named chains. More precise closing: `FOUR CHAINS. ONE WAY IN.` Avoid interpreting the slogan as universal network support. |
| Articles, line 75 | `SLIPWAY GUIDE` links go to generic Networks / Platform / Developers pages | Relabel as `EXPLORE SLIPWAY`, or link to a matching section with real explanatory content. Current link titles imply article content that isn't delivered. |
| Integration grid, line 64 | `Robinhood` | Use `Robinhood Chain`, consistent with the docs and chain strip. Ecosystem logos should be labeled as coverage/tools, not partners or endorsements. |

The main launch/quote/build/graduation, wallet-signing, explicit-fee and inspectable-receipt copy is supported. The FAQ already avoids claiming every configured adapter is always available. Do not import KYMA's original client, revenue, team, review or annual-discount claims. Current audience personas and principles are appropriate content substitutions.

The user specifically names the Developers opening section. Its `dev-hero` block in `App.jsx` contains the “One integration. Every possibility.” heading, intro and code editor. Remove that requested section; this does not by itself request deletion of the Developers route, operation list or resources.

## Responsive issues, ordered by confidence and effect

1. **Confirmed phone integration placement defect.** The final `@media(max-width:809px)` rule resets `.k-integration-cell:nth-child(n)` to `grid-row:auto;grid-column:auto`. Its specificity matches and its order overrides the `[data-slot]` positions. JSX omits slots 14/15/18/19 for the center heading, so auto-flow fills that hole and shifts the later cells. Keep the four-column explicit slot map on phones. The centered heading is still 2×2 cells (rows 4–5). This is a real cascade problem, not a speculative size concern.

2. **Short landscape layouts have no height-aware treatment.** `.k-problem-stage` is `100svh` but has a 560px desktop / 520px phone minimum. At 844×390, it is taller than the viewport. Phase calculation divides by `innerHeight`, not the actual stage height. Add a short-height layout with smaller ticker insets and headline, and coordinate trigger heights with the same viewport measurement. Keep the 5.2-viewport sequence and reverse behavior.

3. **Fullscreen menu can overlap in landscape.** Phone menu has 80px top + 100px bottom padding, nav padding 60px, five links plus 25px gaps; socials remain absolute at bottom 50px. That cannot fit a 390px-tall viewport, and overflowing links can run through the socials. Use a short-height rule: compact spacing, socials in normal flow, internally scrollable content. Include safe-area offsets for notched devices. No `max-height` or `safe-area-inset` rules currently exist.

4. **Ultrawide alignment is only partially capped.** Standard `.k-container` and standard body grid pseudo-elements already correctly cap at 1920/1840px. Header grid, chain strip, menu content, problem grid and footer content still spread across the viewport. At 2560px their quarter-column lines no longer match the body. Give their inner content the same centered 1920px box with 40px inset. Cap the `21vw` footer/menu wordmark against the capped inner width.

5. **Dashboard's scaled-desktop interval needs review.** The 1600×900 canvas changes to a real flow layout only at 1100px. At 1101–1199px it still compresses its desktop text to about 65–70% size. Prefer reflow by the existing 1200px reference breakpoint. Below 500px it already uses one column. Check 1024×768 and 1180×820, not only a 390px phone.

6. **Phone controls are visually small.** Menu hit box is 34px high. Slider track is 2px with a 15×20 thumb. Preserve their visible reference shapes but enlarge invisible interactive hit regions. Dashboard search and select styles explicitly use 12px; phone input text should be at least 16px to avoid focus zoom. Integration tooltip text reaches 6px; once real logos replace text labels, retain readable names through touch/focus disclosure and accessible labels.

7. **Small-phone card layouts need a rendered pass.** Principles remain two columns at 320px, each roughly 150px including 30px padding. Audience portraits retain a 250px minimum height even when their 40% column is only 120px wide. The mission's two text cells also remain half-width. These are narrow, tall compositions rather than confirmed overflow. Check their text with the final copy before deciding whether a ≤360px exception is needed; avoid globally flattening the KYMA phone layout.

## Remaining reference fidelity deltas

- **Actual mono font weight:** only Roboto Mono 500 is loaded. KYMA labels use actual 700, normally 11px / 1.25, tracking −.05em. Current label rules use 500 / 10px / 1.4. Load the required weight and apply it to section labels, pricing and navigation metadata. TASA standard H2 60/45/37 and who statement 70/50/40 are already present; keep those.
- **Observer semantics:** `useSeen(threshold)` only tests `entry.isIntersecting`. Initial observation can reveal a partially visible element below the requested ratio. Check `intersectionRatio >= threshold` (with a special threshold-zero path) before disconnecting. Generic fades and image wipes currently pass .15; reference common fades use .5, mission photo 0, service hover image .5. Make the threshold a per-instance choice.
- **Problem reveal on phones:** `Ink` hard-codes start90%/end60%. The reference phone problem uses speed2, i.e. start100%/end80%. Who statement remains 90/60. The final replacement heading is currently plain text; it should retain the reference's reveal behavior.
- **Navigation roll:** `.k-roll-window>span {line-height:1}` overrides the nav's `.8` line-height. Reference travel equals the actual .8 line-height (65px desktop text → 52px travel), not 65px. Keep clipping and duplicate-glyph travel consistent with that measure.
- **Button arrow:** CSS rotates the whole pixel arrow 45°. Reference rearranges its square pixels into the hover arrow; preserve pixel alignment and change the shape/state instead.
- **Labels and price decode:** current label is a deterministic 22ms left-to-right glyph replacement; current price is a 348ms digit cycle. Reference labels use 2000ms virtual duration /100ms speed at speed÷3 intervals (~.67s actual), 20% scramble. Price uses its separate random-burst text-change decode. See the motion audit for exact settings. These are remaining differences, not missing sections.

## Logo replacement inventory

Replace the four chain-strip glyphs, text-only integration marks and small network badges with real marks. Named entities in the current grid: Solana, MCP, Base, TypeScript, Pump.fun, Meteora, Uniswap, BNB Chain, Raydium, Robinhood Chain, PancakeSwap. WebSocket and webhooks are capabilities, not companies; use intentional transport/event icons rather than invented corporate logos. Preserve monochrome treatment where brand rules allow, 40px reference marks, original aspect ratio and tooltips. The last accent tile is an action, not a logo.

## Focused verification sizes

320×568, 360×640, 390×844, 430×932; landscape 844×390; tablet 810×1080 and 1024×768; breakpoint edges 809/810 and 1199/1200; desktop 1440×900; ultrawide 2560×1440. Verify menu opening/scrolling, all integration slots, problem phase progression, calculator controls, pricing, network tabs and dashboard controls. Check horizontal overflow with the final real logos and longest copy. Preserve 40/20/10 horizontal and 120/90/60 vertical spacing where no phone-height constraint requires a deliberate exception.
