# Platform fidelity audit — revision 4

Read-only comparison of the complete supplied `references/platform-brief.txt` (497 lines in this copy) and `public/platform-experience.html` (17 long lines). Slipway copy/colors and the requested removal of the hero-card logo are intentional adaptations. Everything below concerns structure, geometry or behavior. No application source was edited.

## Keep what already matches

The desktop 1685×1073 scaling formula, 1200px breakpoint, two panel slots, pane geometry, 33/26px outer/inner radii, Figtree 500 / Instrument Sans 400, main title size120/108, three-card track, hero entrance durations/delays, 4300ms rotating-card entrance, and 3400ms forward /1600ms reverse scene transitions are substantially implemented. The exact transition constants and reveal start/duration table already match. Rebuild the omissions below without replacing those working timings.

## P0: compact/mobile architecture is materially different

Current HTML lines6–8 and15 substitute a simplified responsive design for brief lines392–486.

| Required by supplied brief | Current implementation / action |
|---|---|
| ≤1199.98: `--pad:clamp(24px,3.2vw,40px)`, `--tgap:clamp(18px,2.4vw,30px)`, `--bar-h:calc(46px + var(--pad)*2)`; panel padding `calc(bar-h + tgap) pad calc(pad + 6px)`; radius `clamp(26px,2.6vw,33px)`; 20px gap between slots. | Fixed100px/24px/24px panel padding and24px radius; no inter-slot gap. Restore the compact variables and dependent layout (brief409–412). |
| One **fixed**, blurred hero topbar through1199.98; inset0 0 auto; z100; padding=pad; background alpha.72; blur18px. Other topbar hidden. All logo/nav/button positions become flow/static. | Topbar stays absolute with logo/nav/button absolute. Burger exists only under600. Tablet shows the full desktop nav. Implement shared compact header for the entire<1200 band (brief413–430). |
| Hero scene is a one-column grid. Left pane returns as the surface under content in grid-area1/1; content padding `clamp(28px,4.2vw,56px)`. | Left pane remains hidden. Scene remains `display:contents`; tablet grid is applied to `.hero`, and all600–1199 widths are forced side by side (lines6–7). |
| Showcase is a four-row flow grid: `auto minmax(0,1fr) auto auto`, eyebrow/card/**copy wrapper**/dots. min-height380px, aspect5/4, max-height `min(56dvh,620px)`, padding `clamp(20px,3.4%,34px)`, gap `clamp(14px,2.4%,24px)`. | Showcase is fixed800px,710px on tablets,730px on phones. Children stay absolute; `.showcase__copy#spending` is absent. Add wrapper and flow layout (brief434–439). |
| Side-by-side only600–1199 **and min-aspect-ratio1/1**. Columns1fr/.9fr. Height `clamp(430px,calc(100dvh - bar-h - tgap - pad - 6px),720px)`. Title `clamp(40px,7.6vw,92px)`. | Every tablet gets equal columns,710px pane and title `clamp(50px,8.3vw,88px)`. Portrait tablets should stack (brief442–447). |
|940–1199 features: two equal columns; last card spans row and is half-width `calc((100% - tgap)/2)`. | Features remain one flex column at all widths below1200. Entire940 breakpoint missing (brief449–451). |
| Under600: pad `clamp(16px,5vw,24px)`, gap `clamp(14px,4vw,22px)`; title `clamp(40px,13vw,72px)`; lede `clamp(16px,4.4vw,19px)`; content padding `clamp(22px,6vw,34px)`; showcase aspect3/4,min-height62dvh,max-height620px. | Fixed14px padding and730px showcase; larger57–90px title, plus a second≤360 override. Restore the specified fluid phone rules (brief453–460). |
| Under600 feature cards become **native flow layout**, no whole-card scale. Cardwidth100%,heightauto,transformnone. Surfaceinset0. Content relative/flex column; text static32/29 heading and18/23 body; paragraph margin-top22px. | JS scales all feature cards at every<1200 width. At320px (292px inner width), the18px body is effectively~9.6px. This is the largest phone fidelity/readability gap (brief461–486). |

Phone art bands and positions must be implemented literally:

- Security: `--art-h:calc(317px + 17.2%)`; footer `max(40px,11.8%)`; ring top0,width88%; tag63px; plate128px; well145px; key186px. Center key and rotate90deg.
- Graduation/staking: `--art-h:min(412px,calc(148px + 76.3%))`; same footer; outer ring top11.5px,width92.2%; inner left48.4%,top9.5px,width48.4%; tag38px; card140px,width`min(346px,100%)`; badge94px,inner104px,bolt123px.
- Connected/transfers: `--art-h:calc(98px + 57.8%)`; globe/fade top98px,width100%,ratios545/411 and548/413; ring top98px plus margin-top40.7%,width87.6%; lefttag8%/123px; righttag12.6%/94px. Mobile node is fixed atleft33.5%/top89px with no offset-path or path animation.
- JS `scaleFeatureCards()` must run only600–1199; below600 clear its custom properties and inline slot height (`releaseFeatureCards`). Add orientationchange alongside existing resize/visualViewport handlers. Reference lines334–344.

## P1: buttons, navigation and requested logo removal

- Remove **only** `.metal-card-content > img` in HTML line14 to satisfy “remove hero card logo.” Its76px image plus30px margin rules (and tablet55px/15px override) can be deleted. Preserve the Slipway header logo. The orbit-card logo is a separate element, not the named hero-card logo.
- Brief112–116 requires a `.navmenu` wrapping the three links **and** CTA in each topbar, plus a burger controlling that wrapper. Current markup has no wrapper, only one burger, and its CTA always stays outside the menu. Preserve the original three-link+CTA composition; Slipway labels/destinations can be adapted intentionally.
- Compact dropdown: right0,top`calc(100% + 14px)`,width`min(300px,100%)`,padding14px,radius26px,shadow`0 32px 43px -13px rgba(0,0,0,.48)`. Closed opacity0/visibilityhidden/translateY(-8px)scale(.98); .22s ease open; blur27.3px. Link gap6px; full-width CTA46px high,margin-top10px. Phone dropdown left/right=pad. Current line8 uses display:none/block with no transition and excludes CTA.
- Burger must be the18×1.5px three-line geometry at offsets±5.5px, turning into±45deg close in.22s. Current Unicode `☰` never changes shape.
- CTA outer244×63, label189×63, arrow63×63 atleft181 already match. Replace the Unicode26px `↗` with the brief's21.21×21.21 SVG arrow rotated90deg (brief161–168), retaining Slipway color.
- Remove the added “Explore the platform ↓” and “↑ Back to platform” controls if faithful original button inventory is the goal. Neither occurs in the supplied design; wheel/keyboard and original nav already provide traversal.
- Clicking any pill must clear other active pills and set `aria-current=true`. Current Features action never updates active state; `selectCard` toggles only Launch/Trade, leaving lifestyle Features active simultaneously. Features also fails to close the phone menu because it is inside `.navlinks` and has no `closeMenu()` call. Burger first-link focus belongs in next rAF, not immediately.
- **Phone dot centering bug:** line12 makes three dots44px wide but retains `left:calc(50% - 18px)`. Resulting132px group center is48px right of center. Pseudo-dot inset16px also produces12px visible dots instead of6px. Keep6px visual dots and9px gap; expand only the invisible20×32 hit area as required by brief439.

## P1: desktop geometry/art differences

All current values below are in HTML line2; original values are in brief135–168 and181–276.

| Element | Current | Required geometry |
|---|---:|---:|
|Header logo width|47|46.92 (height46)|
|Hero title width|720|578|
|Hero lede width|410|357.49|
|Showcase heading width|309|286 (keep left50%−154.5)|
|Showcase subcopy width|299|275.42 (keep left50%−149.5)|
|Showcase eyebrow opacity|.5|.4|
|Inactive dot opacity|.3|.2|
|Orbit card size|346×217 plus rotate−12deg|346×264 at98.3/381; image asset provides its appearance|
|Transfer title left/width|146/250|174/192|

Choose shorter Slipway text that fits the specified boxes instead of widening the layout. The hero card301×423/left50%−150.5/top269 is already correct.

The rings are approximated with bordered divs and CSS masks. Reference uses one SVG circle per ring with N×N viewBox,r=N/2−.5,stroke1 and `ringDown/ringUp` gradients: transparent stop.5436 → opacity.14 at1, opposite direction for transfers. Recreate those gradients in Slipway tones. Current mask starts at10%, so the fade arc is materially different.

Security key is one custom upright SVG. Reference uses **two stacked identical**73×73 key images,90deg rotation,soft-light. Keyplate/well simplified gradients omit multilayer border backgrounds and the well's59.45px blur. Graduation surface omits noise layer. Orbit card is a newly drawn rectangle rather than the specified transparent artwork silhouette; adapt branding without changing the346×264 bounding box. `lcard__content > * {max-width:none}` is missing, which can matter when restoring image assets.

## P1: motion/state differences

Brief313–324 gives distinct reveal mappings. Current `paintFeatures()` (HTML15) applies9px blur to every group except staking-card11px, and applies **no scale reveal**:

|Group|Required blur|Required scale|
|security/transfer/staking base|10px|none|
|security art|9px|plate/well/key .84→1|
|transfer art|9px|none; node also belongs to group|
|staking rings|none, opacity only|none|
|staking card|11px|.9→1|
|staking badge/inner/bolt|8px|.75→1|
|staking tag|7px|.9→1|

Current node lacks `data-reveal=transfer-art`, so it is outside that group's fade. Keep the existing exact start/duration table; fix mappings and reset transforms on finish. Add the specified temporary will-change rules during motion. Hero entrance values already match.

`active` initializes0 and changes only in scripted `jump()`. Brief373 instead requires a viewport-middle hit test. Direct `#features`, native/reduced-motion scrolling, history restoration or scrollbar use can leave the current active state wrong; wheel-up from features can then be ignored. Implement the hit test, and hashchange cleanup/reset/startGlobe specified at brief380. Current markup also lacks `#spending`.

Both videos use `preload=metadata`; brief requests auto. Keep globe without autoplay on desktop (the later explicit video section controls this), start it with the node class in the same task at1880ms. That synchronization is already implemented. Under600, stop the fixed-coordinate node path as noted above. Add `navlinks{transform:none!important}` to reduced-motion styling. Prefix remaining backdrop filters with `-webkit-`.

## Verification targets

Desktop1685×1073 verifies literal coordinates;1440×900 and2560×1440 verify uniform scale/fluid-card recentering. Tablet768×1024 must stack hero;1024×768 must split;940px must switch feature cards to two columns. Phone320/390/599 must have unscaled readable feature copy and centered6px dots. Check599/600 and1199/1200 transitions, open menu at each, resize while open, direct#features, keyboard reverse transition, reduced motion, and no horizontal overflow. Compare original controls and fixed-header behavior, not only static screenshots.
