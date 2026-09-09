import { test, expect } from '@playwright/test';
for(const width of [390,412]) test('Identity all Characters and five sizes '+width,async({page})=>{
 await page.setViewportSize({width,height:844});await page.goto('/qa/identity');
 await expect(page.locator('.user-avatar')).toHaveCount(300);
 await expect(page.locator('.is-visual-loading')).toHaveCount(0,{timeout:30000});
 await expect(page.locator('.character-presentation-frame,.character-presentation-rarity-badge,.character-presentation-attribute-badge,.character-presentation-meta,.character-presentation-badge')).toHaveCount(0);
 const rows=page.locator('[data-character-id]');
 for(const row of await rows.all()){
  const sizes=await row.locator('.user-avatar').evaluateAll(ns=>ns.map(n=>{const b=n.getBoundingClientRect();return Math.round(b.width)}));expect(sizes).toEqual([22,32,38,48,64]);
 }
 const broken=await page.locator('.user-avatar img').evaluateAll(ns=>ns.filter(n=>!(n as HTMLImageElement).naturalWidth).length);expect(broken).toBe(0);
 for(let i=0;i<60;i+=8){await rows.nth(i).scrollIntoViewIfNeeded();await page.screenshot({path:test.info().outputPath('characters-'+i+'.png')});}
});

test('Public identity is frameless while profile deck keeps card frames',async({page})=>{
 await page.goto('/qa/presentation?scenario=public-user-profile');
 await expect(page.locator('.public-profile-identity .user-avatar')).toHaveCount(1);
 await expect(page.locator('.public-profile-identity .character-presentation-frame')).toHaveCount(0);
 await expect(page.locator('.public-profile-deck .character-presentation-frame')).toHaveCount(5);
 await expect(page.locator('.public-profile-identity .user-avatar')).not.toHaveClass(/rarity-/);
});
