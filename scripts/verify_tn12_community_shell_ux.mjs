import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  footer,
  footerCss,
  chatModal,
  chatHook,
  profile,
  settings,
] = await Promise.all([
  readFile(new URL("../src/app/components/Footer.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/components/Footer.css", import.meta.url), "utf8"),
  readFile(new URL("../src/app/components/TribeChatModal.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/context/hooks/useChat.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/components/profile/PublicUserProfile.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/components/SettingsPanel.tsx", import.meta.url), "utf8"),
]);

assert.match(footer, /item\.id === "bbs"[\s\S]*setChatChannel\("GLOBAL"\)[\s\S]*setShowTribeChatPanel\(true\)/);
assert.match(chatModal, /BBSを開く/);
assert.match(chatModal, /navigateTab\("bbs"\)/);

assert.match(footer, /Number\(chatUnreadCounts\?\.GUILD \|\| 0\) \+ Number\(dmUnreadTotal \|\| 0\)/);
assert.doesNotMatch(footer, /communityUnreadCount[\s\S]{0,120}GLOBAL/);
assert.match(footer, /communityUnreadCount > 99 \? "99\+"/);
assert.match(footerCss, /\.footer-unread-badge/);

assert.match(chatHook, /chatChannel !== "DM"/);
assert.match(chatHook, /guild_chat_unread_/);
assert.match(chatHook, /table: "board_posts", filter: "target_type=eq\.GUILD"/);
assert.match(chatHook, /refreshChatUnreadCounts\(\)/);

const identityIndex = profile.indexOf("public-profile-identity");
const dmActionIndex = profile.indexOf("public-profile-dm-action");
const powerIndex = profile.indexOf("public-profile-power");
assert(identityIndex >= 0 && dmActionIndex > identityIndex && dmActionIndex < powerIndex);
assert.equal(profile.match(/>DMを送る</g)?.length, 1);

assert.match(footer, /footer-upcoming-badge/);
assert.match(footer, />準備中</);
assert.match(footerCss, /\.footer-upcoming-badge/);

assert.doesNotMatch(settings, /<dt>称号<\/dt>/);
assert.doesNotMatch(settings, /ChoiceGroup label="称号"/);
assert.doesNotMatch(settings, /titleDraft/);
assert.match(settings, /handleUpdateProfile\(\{ username: usernameDraft, bio: bioDraft \}\)/);

console.log("TN-12/TN-14 Community shell UX verification: PASS");
