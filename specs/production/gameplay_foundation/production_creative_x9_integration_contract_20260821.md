# Production Creative x9 Integration Contract

Date: 2026-08-21
Status: **INTEGRATION CONTRACT FROZEN / GACHA REPLACEMENT ASSETS DELIVERED 2026-08-29**

## Authority and scope

The static Production Creative manifest at `src/domain/presentation/production_creatives.ts` is the display authority for the nine Production Creative slots. Historical Gacha and Home banner DB rows remain untouched and are not the authority for these nine assets.

No image was generated, inferred, copied, renamed, or adopted. Existing `public/promotion/X_chara_*.png` files remain unrelated social-promotion assets.

## Frozen slots

| Slot | Canonical path | Dimensions | Ratio | Availability |
|---|---|---:|---:|---|
| SP Character / `CHAR_SPECIAL` | `/promotion/gacha_sp_character.png` | 1280x640 | 2:1 | Delivered (RGBA) |
| SP Skill / `SKILL_SPECIAL` | `/promotion/gacha_sp_skill.jpg` | 1280x640 | 2:1 | Delivered |
| SP Equipment / `EQUIP_SPECIAL` | `/promotion/gacha_sp_equipment.jpg` | 1280x640 | 2:1 | Delivered |
| Normal Character / `CHAR_NORMAL` | `/promotion/gacha_normal_character.png` | 1280x640 | 2:1 | Delivered (RGBA) |
| Normal Skill / `SKILL_NORMAL` | `/promotion/gacha_normal_skill.jpg` | 1280x640 | 2:1 | Delivered |
| Normal Equipment / `EQUIP_NORMAL` | `/promotion/gacha_normal_equipment.jpg` | 1280x640 | 2:1 | Delivered |
| My Page 01 | `/promotion/mypage_banner_01.png` | 1200x200 | 6:1 | Delivered |
| My Page 02 | `/promotion/mypage_banner_02.png` | 1200x200 | 6:1 | Delivered |
| My Page 03 | `/promotion/mypage_banner_03.png` | 1200x200 | 6:1 | Delivered |

Gacha replacement files preserve their delivered 1280x640 canvas. Character banners use PNG/RGBA so the supplied white canvas bands can be transparent without cutting the figures; Skill and Equipment retain the supplied JPEG bytes. Runtime rendering uses intrinsic dimensions with `width: 100%`, `height: auto`, and `object-fit: contain`.

## Availability and fallback

Availability is explicit in the static manifest. All nine current entries use `enabled: true` and `available: true`. A future pending entry must use `available: false`; Runtime must not request its path.

- SP unavailable: retain the current text-only card.
- Normal unavailable: retain the current `/gacha/bg_gacha_normal.png` Presentation and free-ten-pull visual.
- My Page unavailable or partially delivered in a future rollout: retain the existing two-banner fallback/master behavior.
- My Page switches only when all three entries are available in order 01, 02, 03.
- My Page destinations are `guild`, `raid`, and `null` in order 01–03. A null destination performs no navigation.

## Runtime connection

Gacha uses the existing Normal/SP and Character/Skill/Equipment cards. The optional promotion zone is 96px high and does not change pull controls, probability, rarity, price, ticket display, navigation, animation, Tutorial Gacha, or result presentation.

My Page retains the existing carousel, 4-second interval, arrows, cover rendering, and order logic. No new carousel architecture is introduced.

## Impact

- DB schema/data/migration: none
- Production/Preview: untouched
- Monetization/economy: unchanged
- Gameplay masters, Battle, Mission, Progression, Ranking, Reward: unchanged
- M9-X Human-PASS hierarchy: unchanged; only the optional image content inside the frozen visual zone is connected

## Final Device Acceptance deferral

The following pending Presentation and device-polish items are consolidated into the Final Device Acceptance Gate. They do not block Preview migration replay preparation:

- Gacha Promotion Creative x6 and My Page Banner x3 are delivered and connected; final device rendering acceptance remains required
- BGM and SE, including volume, playback, missing-file/404, and mobile-device playback checks
- Mission mobile layout
- Mission claim processing feedback
- Reward acquired Dialog visual consistency
- Common Async Feedback and Common Modal polish

No placeholder, generated Creative, social-promotion reuse, or inferred destination is permitted during the deferral.

## Final device acceptance

Verify 9/9 files, exact paths and dimensions, Normal/SP and category mapping, no stretching/broken image/unintended crop, readable safe-area content, correct My Page 01-02-03 rotation at four seconds, destination behavior, 390x844, 412x915, desktop-shell rendering, Gacha contract consistency, and no Tutorial/M9-X regression.
