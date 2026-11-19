# Revision 4 — platform reference asset inspection

Inspected 2026-11-17. All six files were downloaded from the exact URLs in `references/platform-brief.txt` into `/tmp/slipway-platform-reference`. The source brief was treated as reference data for this audit. No application source or production image asset was edited.

## Downloaded files

| File | Actual dimensions | Exact source URL | SHA-256 |
| --- | --- | --- | --- |
| `/tmp/slipway-platform-reference/silver-card.png` | 896 × 1200 | [Source](https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260826_235351_70b6115b-a70b-43bb-a647-4ce7e1822875.png) | `29b8e3c6e0c348c8af631dd5e465e1665d8acaf5cd0745a416cca71d37604d79` |
| `/tmp/slipway-platform-reference/black-card.png` | 1200 × 896 | [Source](https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260826_235358_adfda61f-2eab-4b0d-bcfb-16d51d040169.png) | `50460774c17e2aa03d1e037f7a12cd873dc0abaee63497d891db2561466049ac` |
| `/tmp/slipway-platform-reference/arrow.svg` | 21.21 × 21.21; viewBox 0 0 21.21 21.21 | [Source](https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/96c6fd8f-f830-4557-910d-448abb667292.svg) | `6523d2b80b57786bebdf3cf9aa7c5ad1d0b02cc42f03674615d281248f215ef1` |
| `/tmp/slipway-platform-reference/key.svg` | 73 × 73; viewBox 0 0 73 73 | [Source](https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/0c985e57-95bf-4425-b1ea-22afb746d1b7.svg) | `871e5cddba8579aecb0ba631192caa9d5ccfdc9d55a78f94698d9136353565ea` |
| `/tmp/slipway-platform-reference/bolt.svg` | 38 × 38.52; viewBox 0 0 38 38.52 | [Source](https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/3b0eb749-45c9-4539-838d-35e5bcc2557d.svg) | `3f9fb39272d68d2acf3e52250c49952442710b6bf6a40946a88d159ee99e5f5f` |
| `/tmp/slipway-platform-reference/noise.png` | 160 × 160 | [Source](https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/b5d82d6c-1778-4485-b23d-001836c144bc.png) | `48aee5db35f76602b3e2584271bd94a7f7ad5a12f498f50974d9926b4f5f2488` |

## Silver hero card

Viewed the actual image with `view_image`. It is a flat, front-facing portrait card, nearly filling the 896 × 1200 canvas, with large round corners. Its surface is silver brushed metal with very fine vertical grain and broad reflected bands. The upper-left and lower-right regions are darker; the central and lower-left regions have bright reflections. There is a black VISA wordmark near the top-right corner, including the familiar small flag shape on the V. A black outlined chip appears near the lower-left corner. There is no cardholder name, number, expiry, contactless symbol, separate bank name, or Slipway emblem.

The VISA wordmark and chip are baked into the bitmap; they are not independent SVG/HTML layers. The PNG has alpha, but its cutout is not perfectly clean: corner pixels retain very faint white alpha (about 6–10/255), and many card pixels are slightly translucent. This can produce a fine pale edge on a dark burgundy background. The file’s actual 896:1200 aspect ratio differs slightly from the brief’s display box of 301 × 423; using both exact CSS dimensions produces the brief’s intended modest vertical stretch.

## Black feature card

Viewed the actual image with `view_image`. It is a front-facing landscape card with rounded corners, a fine rim, vertically brushed dark metal, and a soft shadow beneath the lower edge. The top center is medium silver-grey and the bottom is almost black. A recessed rectangular chip is in the left upper-middle area. A subdued grey VISA wordmark is at lower right. There are no other words, account numbers or personal details. The wordmark and chip are baked into the image.

The 1200 × 896 canvas includes considerable fully transparent space below the card: the nonzero-alpha content spans roughly x=15…1170 and y=0…718. Do not crop the source if preserving the reference composition; the transparent lower margin and shadow affect its placement. The supplied display box is 346 × 264, slightly taller in proportion than the PNG itself.

## Supporting graphics

- `arrow.svg`: one black upward arrow. The brief rotates it 90 degrees for the CTA, yielding a rightward arrow. Use the actual asset to preserve its specific shaft and arrowhead proportions.
- `key.svg`: a white diagonal key silhouette with a rounded rectangular head, inner cutout and notched shaft. The brief’s keyplate applies an additional 90-degree rotation.
- `bolt.svg`: a white asymmetric lightning/paired-arrow silhouette with rounded corners. It is not a generic single zigzag bolt.
- `noise.png`: actual size is 160 × 160, despite “1px grain tile” in the brief. It contains black noise with alpha 0…9/255, about 3.5% maximum opacity. Retain its natural tiled scale for the intended subtle texture.

The three SVGs contain only one path each and no scripts, external resources, or embedded raster images.

## Adapting the design to Slipway

The original card silhouettes, round corners, brushed-metal grain, reflected bands, chip positioning and soft shadows can be kept while the surrounding surfaces and text adopt burgundy, champagne and gold. A restrained gold/champagne tint on the silver image and an oxblood tint on the black image can preserve their geometry, grain and contrast, but a CSS tint affects the entire bitmap, including its baked marks. Exact branded hues depend on the underlying grey value.

For the request to remove the icon on the hero card: if the current implementation adds a separate Slipway emblem over the card, remove that added DOM image/icon while retaining the underlying original card treatment. The original silver asset contains no Slipway emblem. If “icon” means the original VISA mark or the chip, neither can be independently switched off with CSS because both are baked in. A local image edit is required to reconstruct matching brushed metal in that area; that edit can preserve the overall design, but should be visually checked and cannot honestly be called pixel-identical in the edited region. No such edit was performed in this audit.

For info replacement, keep any required Slipway wording in real HTML around the card. If wording must appear on the physical card, first produce a clean texture without the irrelevant baked mark, then add crisp real text at the reference location; adding another emblem is unnecessary given the explicit removal request.
