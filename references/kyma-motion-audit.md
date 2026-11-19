# KYMA exact-source motion and layout audit

Research date: 2026-11-17. Public source: https://kyma.framer.ai/ . Scope: homepage, navigation/footer and shared components. Do not copy KYMA's company claims into Slipway. This audit describes the reference mechanics; adapt content/colors without removing sections.

## Evidence and source files

All files live in `/tmp/slipway-recordings/`. Raw `.mjs` downloads are the public shipped source. `.formatted`, `.scan`, `.lines` are reading-only transformations. Do not execute them as an app. The source base URL is `https://framerusercontent.com/sites/1pqfI02tvabzHSVSgqY7Xs/`.

- `kyma-home.mjs`: actual homepage `hPIUYMJfvyK1b_l2XRwPMwUellkmL09qNuPMYh75018.DyU4PHbE.mjs`. Layout, problem sequence, all instance props, triggers.
- `kyma-script.mjs`: `script_main.BCB5IjE5.mjs`. App shell, fullscreen menu, hamburger, route transitions, intro.
- `T6_Dvbn2s.CPvQgC5p.mjs`: custom character color reveal, standard H2 component.
- `shared-lib.BCsZym-q.mjs`: scrambled labels, pixel arrow, grid borders.
- `ZSVOsJNn5.LYv4zqUJ.mjs`: process, metric bars, service hover, testimonials, team, integrations, pricing.
- `EW4b84PO8.N9REGbTn.mjs`: Big Quote word reveal, metric description, stat blocks.
- `Nv8z6fTRq.BAjX_ca_.mjs`: two-layer image wipe.
- `fvcUJ1JOp.BQJgJ-PR.mjs`: primary button.
- `lNxdnSQzG.DJ-H2tqW.mjs`: primary link.
- `VqxbmBFcp.B32n5lA2.mjs`: rolling text, nav links, footer.
- `LXMBP00YP.DUiP7NEh.mjs`: line-pattern texture.
- `Yuv5fMFTx.CzuWiqrS.mjs`: FAQ and layout-jump prevention.
- `KA40gyoiW.CBfA6DN4.mjs`: articles.
- `ututwHdzz.rX6aeMLX.mjs`: case study and client logos.
- `Lenis.CmVB4lrx.mjs`: actual Lenis implementation/config.
- `REFERENCE-NOTES.md` and extracted movie frames: visual context. Source audit takes precedence over earlier inferred animation descriptions.

## Global geometry and motion

- Desktop breakpoint >=1200px, tablet810–1199.98px, phone<=809.98px.
- Inside max-width1920px. Horizontal padding40px desktop,20 tablet,10 phone. Four consistent columns, fine1px grid lines. Do not replace with variable 5vw margins.
- Most homepage sections have vertical padding120px desktop,90 tablet,60 phone. Integration grid is intentionally unpadded vertically.
- Body root font-size125% desktop,106.25% tablet,93.75% phone. Actual component typography commonly uses explicit px, so retain explicit sizes below.
- Headlines TASA Orbiter800. Standard H2 60px desktop,45 tablet,37 phone, tracking-.03em, line-height100%. Who statement uses70/50/40. Integration heading phone23px. Nav65/50/35, tracking-.02em,line80%.
- Micro labels Roboto Mono700,11px,line100–120%,tracking-.03em.
- Lenis page instance: `smooth:true,intensity:12,infinite:false,orientation:'vertical'`. Wrapper translates intensity into `duration:1.2`, smoothWheel true, autoRaf true, autoToggle true, anchors true, allowNestedScroll true, stopInertiaOnNavigate true. Touch remains native (intensity ignored).
- Opacity-only entrance is common: from0, duration.6s, cubic-bezier(.68,0,.22,.83), threshold.5 once, varied delay0–.6. Generic translateY entrance everywhere is inaccurate.
- Body lines and paper/grain texture continue through sections; source grain is a small repeating GIF.

## Reusable animation primitives

### H2 character highlight

Source function N in T6 module. Separate EVERY CHARACTER in inline spans, keeping words/line wrapping intact.

- In-view: each character uses inView once, amount.5. Character delay index*staggerSpeed.
- Standard H2 staggerSpeed=.01s, fadeAfter=.2s, startingOpacity0, startingColor dark. At trigger: opacity1, immediate highlight color (color0s). After .2s switch to final color through color.3s linear. Opacity.3s ease-out.
- Integration/pricing direct instances use stagger .006s.
- Replay false for standard headings. Don't re-run continuously.
- Who statement and main problem use scroll mode instead. `S=clamp(.9+speed*.05,.5,1)`, `C=clamp(.6+speed*.1,.1,.9)`, useScroll offsets [`start ${S}`,`end ${C}`]. At speed0 reveal starts when element top reaches90% viewport, completes when element bottom reaches60%. Revealed count=floor(progress*characterCount+0.0001). It is reversible.
- Who scroll text:70px, highlight hold.25s, starting opacity.15, end dark. Main problem60px and same values. Phone problem scrollSpeed2 => start100%,end80%.

### Scrambled mono section labels

Source `z` in shared-lib. Threshold.5 once. Symbols from alphabet/digits/punctuation. Defaults duration1000ms,speed50ms,scramblePercent30; initial characters empty then resolve left-to-right. The in-view timer runs every speed/3 ms while the virtual progress increases by speed. Thus actual wall time is about one-third the duration property. Hover mode uses independent random bursts, 2–3 bursts per character,150–300ms burst durations, tick speed/2.

Actual section-label instance overrides: duration2000ms, speed100ms, scramblePercent20; Roboto Mono11/700, line125%, tracking-.05em. In-view tick speed/3 means wall time approximately .67s. Do not substitute a blinking underscore for the actual decode. Section label component also includes number marker and trailing underscore.

### Image reveal

`Nv8z6fTRq`: left-to-right hard-edged mask0→100%, two layers. Accent background moves first, image mask follows with delay.15s. Both duration.5s,ease(.87,0,.13,1). No opacity fade or rounded image frame.

### Primary button

50px high, padding10px15px, square corners, dark fill,1px line border,2px accent bottom line. Pixel arrow15px (not generic diagonal Lucide arrow). Hover changes pixel arrangement and reveals diagonal line pattern over whole button. Base spring damping60,stiffness500,mass1.2; arrow spring bounce.2,duration.4. Bottom glow alpha.25→.5. Normal label remains stationary.

### Rolling link/nav text

`VqxbmBFcp` We function: per-character y0→-one-line-height, clipped character spans. Duplicate glyph provided with textShadow0 lineHeight 0 currentColor. Duration.4s,cubic(.87,0,.13,1). Nav stagger70% means delay per character=.4/characterCount*.7; final character starts near .28s. Hover leave reverses. Supports reduced motion via zero-duration/zero-stagger.

## Homepage order and specific behaviors

1. Original KYMA hero (intentionally replaced by Caspia hero in user's chosen composition).
2. Client logo strip.
3. Who we are statement, small quote/author, staircase metrics.
4. Long pinned problem sequence ending with replacement headline.
5. Calculator (nested in problem section but visibly its own cream section).
6. Dark services.
7. Cream process timeline AND post-launch support block.
8. Dark featured case study.
9. Cream testimonials: section heading, big quote, rating/summary, four testimonial cells.
10. Dark integration grid.
11. Cream team: headline,2×2 profiles, mission text, lower hiring strip.
12. Dark pricing.
13. Cream FAQ.
14. Cream articles.
15. Dark booking/CTA section (user forbids contact/email, so preserve composition with product actions/content).
16. Cream footer (replace contact/newsletter functions as requested, retain visual depth and spacing).

### Who and metric staircase

Who outer padding120px, standard inside4col grid. Main statement uses scroll character reveal, not whole-block reveal.

Metric cards form a real HEIGHT staircase. Each column has number/description ABOVE bars. Variant25% has6 total bars (top3 empty,bottom3 filled),50%=9 total(3empty+6filled),75%=12(3empty+9filled),100%=15(3empty+12filled). Bars15px high,15px gap,padding20px. Number text is static, NOT a number scramble/count-up. All columns bottom-aligned.

Filled bars trigger off their associated `stat1...stat4` section refs, threshold.5, once. They fill bottom-to-top. Bottom delay0, then.05,.1,.15,.2,.25,.3,.35,.4,.45,.5,.6. Fill duration.2s,ease(.87,0,.13,1). Empty top3 stay empty. Description wipe duration.8s,ease(.87,0,.13,1), column delay0/.2/.4/.6.

### Pinned problem: critical missing mechanism

`kyma-home` component Y, name Problem Scroll Animation.

Structure before calculator: sticky stage100vh(top0,z1), then three trigger blocks100vh each, then End block120vh(top0,z1). Total reference scroll footprint before calculator:5.2 viewport heights. Calculator follows on top at z2. Parent wrapper uses overflow clip (avoid overflow hidden breaking sticky).

Variants: Start; Show2; Show4; ShowAll; End. Each target block triggers at50% visibility. `animateOnce:false`, so scrolling backwards reverses states. State transition .8s,cubic(.4,0,.2,1).

- Start: cream/transparent background, centered dark statement, labels hidden.
- Show2: background dark, headline cream, first2 problem labels shown.
- Show4: next2 appear.
- ShowAll: all8 labels shown.
- End: background returns transparent/cream, original headline scale1→.3 + opacity1→0; replacement headline scale.3→1 +opacity0→1. Replacement starts bottom:-150px and ends centered top50% translated(-50%,-50%). Entire problems layer scales1→3, pushing rows outward.

Four ticker rows:2 above and2 below headline. Parent overlay full absolute inset0,padding100px0,space-between. Pair gap40px. Each ticker30px/s,gap15px,draggable true,hover speed modifier0 (pause), alternates forward/reverse. Labels have hidden/visible variants, opacity0→1 using .6s,cubic(.4,0,.2,1).

Do not collapse to a short dark marquee section. This scroll distance/state progression is most of the perceived missing animation.

### Calculator

Middle two of4cols (50% width). Cream label/heading offset25%. Black panel; three actual sliders and timing toggle. Underpanel supporting quote left and CTA right. Keep substantive block, not just a compact card. Existing Slipway integration planner is acceptable content adaptation; preserve grid placement and section scale.

### Services

Outer padding120px. Each row padding80px0, top1px border. Four-column grid: number col1; title/icon col2; description+chips spanscols3–4. Title/icon max-width85%,description max550px. Text/chips gap30px;chips gap15.

Desktop media/quote is HOVER ONLY. On hover normal four-column content dims to opacity.2 when image present; row switches bottom25px stripe pattern variant. Overlay width250px, positioned relative to row top, alignmentend, offsetY150px,collisionPadding15,z7. Contains image wipe then small quote/avatar. On leave restore content and hide overlay. Overlay enters from x=-75px,opacity0 to x0,opacity1, and exits reverse. Main row and overlay transition .5s,cubic(.4,0,.2,1). Source overlay image repeat enabled,threshold.5.

Phone padding40px0, number col1/title spans3, description spansfullwidth. Image/quote becomes inline; normal content staysopacity1.

### Process timeline and support

Interactive, NOT scroll controlled. Four staircase cards: desktop hover chooses active step; phone click/tap. First active initially. Accent progress width25/50/75/100%, height5px, transition .6s, cubic(.87,0,.13,1). Fine ruler below with1px ticks (short7px,tall10px), gap15px to progress.

Card content top padding50/100/150/200px for steps1–4. Card header padding20px. Active has2px accent bottom rule; inactive dimmed; transition .6s, cubic(.4,0,.2,1). Intro fades opacity only over .6s, delays .1/.2/.3/.4, curve(.68,0,.22,.83).

Phone cards stack, top padding30px; progress becomes2px vertical line height25/50/75/100%. Keep post-launch block below: heading left1col, main statement right3cols,3 benefit cells across last3cols.

### Featured case study

Two half-width areas. Left metadata/headline/two metrics/action, right large edge-filling photo. Not a generic centered card. Image uses reveal primitive; source in ututwHdzz module.

### Testimonials

Header offset one column. Big Quote is WORD reveal, unlike H2s: opacity.001,y5→opacity1,y0; threshold.5, once; word stagger.01s, duration.6s, ease(.4,0,.2,1), startDelay0. Author/logo entrance separate. Do not apply heading highlight character animation to quote.

Large rating at left below quote plus summary row. Four testimony cells, first accent background, three cream; fine grid. Actual source testimonial/card texts are not Slipway claims—replace with product principles while keeping this structure.

### Integration grid: exact arrangement

Four columns, eight100px visual rows (six regular rows plus central200px block). Whole inside max1920 with40px margins; no vertical section padding. Fine horizontal+vertical separators. Most cells intentionally EMPTY with diagonal pattern, not filled text chips.

Reference occupancy (replace logos with valid Slipway ecosystem equivalents, preserve holes):

```
Python   empty    ChatGPT empty
empty    AWS      empty   Github
Zapier   empty    Make    empty
empty    [   CENTER   ]   Docker
Cloud    [  HEADING   ]   empty
empty    Claude   empty   NodeJS
Vercel   empty    Stripe  empty
empty    Airtable empty   +40 accent
```

Heading centered in2col×2row area. Logos40px with30px padding. Logo entrance opacity0→1, .6s, cubic(.68,0,.22,.83), threshold.5 once; delays arranged0/.1/.2/.3/.4/.5/.6. Tooltip top center, offsetY-10, accent pill5px radius, padding5px7px, from y20 opacity0 to y0 opacity1 in .2s, cubic(.12,.23,.5,1).

### Team, mission and hiring strip

2×2 card grid, gap0. Each card: metadata header10px15px with2px accent bottom; main image LEFT40%, aspect.75:1; right60% bottom aligned. Right area has name/role half and socials half. Phone right area becomes column. Image onInView scale1.25,y5→scale1,y0, spring damping60, stiffness327, mass1.

After cards retain mission text and lower hiring strip. Content gap120px desktop,80phone. Hiring strip4cols: photo spans first2(max-height400); accent avatars block col3; text/careers col4. Each text block padding30desktop20tablet. Photo wipe threshold0 once. This lower strip is missing in current page and visually substantial.

### Pricing

Section padding120px0; heading/label gap15px; header→table gap80px; table toggle→cards gap50px. Three equal columns, gap0. At<=1199 layout stacks in source.

Card reference width400,height789 (auto to content). Top info padding40,gap32; price area25px40; benefits40px40px80,gap15; bottom CTA50px. Outer cards have100px top padding; central card0px (all0px at<=1199). Central highlight card has accent/shader treatment and top badge; preserve offset/ornament without inventing product plan claims. Standard price Roboto Mono40/700,line80%,tracking-.05em.

Price decode uses shared scramble with duration1000ms,speed35,scramble20%,trigger true; on text change reruns. Monthly/annual toggle uses spring bounce.2,duration.4. Custom price uses1000ms,speed50,30%. Original's20% annual saving is reference business copy, not a valid Slipway term unless docs verify it.

### FAQ

Six rows, offset last3cols. Each item .4s cubic(.4,0,.2,1). Header padding20px,gap20; number chip5px padding and15px gap to name. Number shifts from left:-50px into inline position on closed/open variants. Pixel chevron assembled from5px squares, not FontAwesome plus. Body padding0px20px20px,max text500px. Entrance opacity0→1,.6s,cubic(.68,0,.22,.83), row stagger.1,threshold0 once. Independent items, multiple open allowed. Native details without height motion misses reference.

### Articles, CTA and footer

Article grid first featured cell50%, next two25%; large photos wipe, metadata and rolling title links. Preserve three articles and section spacing.

CTA dark split layout, large left headline, right execution/form area. User specifically forbids contact/email, so fill with Slipway launch actions, not contact fields; keep balanced composition.

Footer original padding120px0 0,gap80; max1920,40px margins. Newsletter row plus4col company/nav/social/legal and oversized brand area. Replace newsletter/contact with product actions/socials per user. Footer items entrance opacity-only .6s ease(.68,0,.22,.83),stagger0–.7; nav uses rolling text. Do not shrink to one horizontal row.

## Navigation and route transitions

Fullscreen menu visual mechanism is4 vertical full-height cream panels masked BOTTOM→TOP from0→100%. Desktop duration.8s,delays0/.1/.2/.3; phone1s,delays.1/.2/.3/.4. Ease(.87,0,.13,1). Grid borders wipe separately .4s with later stagger.3/.4/.5/.6. Social content mask delay.35,duration.45,same ease. Whole overlay exit opacity0,.6s ease(.4,0,.2,1). Backdrop opacity exit.3s(.12,.23,.5,1).

Menu composition: four grid columns; left featured card occupies first quarter; nav starts at right half; menu content vertically centered; right content padding60px0. Side padding40/20/10. Phone featured card hidden.

Nav font65/50/35px,TASA800,-.02em,line80%. Per-character rolling hover described above. Hamburger transition.4s ease(.87,0,.13,1),three variants Closed/HoverClosed/Open. Actual button is grid/pixel pattern, not three generic bars.

Route enter: mask270deg wipe,opacity1,y0,delay.4,duration.755,ease(.87,0,.13,1). Route exit: opacity0,y-30%,delay0,duration.755,same ease.

## Largest confirmed gaps in current Slipway implementation

Compared with `site/src/Landing.jsx` and `site/src/style.css` as read during audit:

1. `Reveal` is one generic IO(threshold.15) class toggler. It cannot reproduce per-character color flash, word quote entrance, reversible problem states, image wipe, or interactive process.
2. Problem is a single short section with marquees. Missing5.2-viewport sequence, black/cream state changes, staged2/4/8 labels, zoom-out exit, replacement headline.
3. Metrics render15 static bars for each column and wrong placement. Source has varying total height6/9/12/15, top3empty, number above, and bottom-up fill.
4. Services permanent media and plain row entrances; source media is desktop hover overlay with content dimming, stripe pattern, wipe.
5. Process lacks controlled active index, progress ruler and true hover/tap transition; staircase alone is not a functional replica.
6. Integrations currently24 text links with heading above; source is8×4 visual grid with holes and center2×2 heading, monochrome logos, hover tooltips.
7. Team lower photo+accent avatars+careers strip missing; profile40/60 split and image inView zoom differ.
8. Pricing too compact and wrong typography/motion; keep large3col structure, price decode, toggle motion, benefit spacing.
9. Menu currently whole-word rolling/simple overlay; source per-character roll and four independent vertical mask panels.
10. H2 tracking currently-.05em/line1.02; source-.03em/line1.0. Margin/breakpoint differences compound across long page.

These are source-confirmed structural and behavioral differences, not claims of pixel-perfect local screenshot measurement. Use actual browser checks at desktop and phone after implementing.
