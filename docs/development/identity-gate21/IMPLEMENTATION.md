# Card Visual Gate 2.1 — User Identity Avatar

Base: `001498672453f2b197f597fa8e13c94a02624aa1`

## Authority / scope

`UserIdentityRow → UserAvatar → CharacterPresentation(user-avatar)` is the shared identity renderer. UserAvatar accepts only Character ID / source / alt / class, never rarity, frame or badge props. PublicUserProfile uses it only for the profile owner, not Deck or Character detail.

Crop reuses `characterPresentationMetadata.thumbnailScale / thumbnailX`. All Characters use object-position Y=0 and transform-origin Y=0 to preserve the head. Battle's larger scale and 12% transform origin were visually rejected for this purpose. Existing metadata and images are unchanged; no new per-Character overrides. Values for all 60 Characters are in crop-authority.json.

| Use | Component / Leader authority | Treatment |
|---|---|---|
| Header | Header → UserIdentityRow; existing identityLeaderCharacterId / readiness | Shared frameless avatar, circle retained |
| Ranking user | RankingTab → UserIdentityRow; get_public_profiles.favorite_character_id | Shared avatar |
| Ranking Deck | RankingDeck → CharacterPresentation | UNCHANGED: Character cards |
| Activity ticker/list | HomeTab → UserIdentityRow; actor get_public_profiles projection | Shared avatar; existing small sizing retained |
| Guild member / public Guild detail | GuildTab / CommonModals → UserIdentityRow; favorite_character_id | Shared avatar |
| Guild Chat | TribeChatModal → UserIdentityRow; member.users.favorite_character_id | Shared avatar |
| Global Chat | TribeChatModal → UserIdentityRow | Existing public-profile read RPC resolves actors outside own Guild; no guessed leader |
| BBS thread/post | BbsTab → UserIdentityRow; get_public_profiles.favorite_character_id | Shared avatar |
| Public Profile owner | ProfileCharacter(leader) → UserAvatar | Frame removed; existing square size maintained |
| Public Profile Deck/detail | ProfileCharacter(non-leader) | UNCHANGED: framed Character thumbnails |
| PvP | Header/profile navigation use shared avatar; hero/rival Character preview is Character/Battle content | Battle renderer UNCHANGED |
| Inbox / DM / PC text Chat | No existing Leader icon in text-only sender/conversation rows | No new icon or information-structure change |
| Raid owner/participants | Existing Raid portrait helpers, LeaderIconUrl and thumbnail metadata | Already frameless face/bust crop; accepted Raid renderer/fallback untouched |
| FriendPanel | Separate legacy avatar_url route, feature-gated Friend UI | Not a UserIdentityRow route; left unchanged rather than replacing its fallback or expanding the Friend feature |

## Preservation

No public assets, DB, Migration, Master, character metadata, rarity resolver, GameContext, Gacha, Battle or Raid source changes. CharacterPresentation change is only the variant type union; all existing variant behavior is unchanged. No image transformation or additional Asset.

## Validation

- Build / typecheck / changed TSX lint PASS.
- 30 browser cases PASS: Character HOME, Party / Card Visual, new Gacha, Battle TOP / Ranking / Raid navigation, all Characters × five avatar sizes.
- After refining the common crop, the two 60-Character tests reran PASS. Public-profile test confirms one frameless owner avatar and five preserved deck frames.
- Visual review of 60 Characters at 22/32/38/48/64 px: head and face remain visible; no per-Character corrections required. Automated checks validate sizes, image decode, no frame/badge/metadata DOM.
- Actual Preview screen validation is recorded in outputs/identity-gate21 after deployment. No Production deployment.
