import { test, expect } from '@playwright/test';

// Preview fixture only. No account, message, database write or billing operation.
for (const stop of ['equipment', 'dialogue', 'cutin']) {
  test(`Reduced Motion: ${stop}の表示・停止・再開`, async ({ page }) => {
    await page.goto('/qa/battle-full-skill-load');
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    await page.getByLabel('QA停止位置').selectOption(stop);
    await page.getByRole('button', { name: 'Stress Battleを開始', exact: true }).click();
    const resume = page.getByRole('button', { name: '再開', exact: true });
    await expect(resume).toBeVisible();
    const harness = page.locator('[data-qa-harness="battle-full-skill-load"]');
    const target = stop === 'equipment' ? page.locator('.exclusive-equipment-band').first()
      : stop === 'dialogue' ? page.locator('.exclusive-skill-dialogue span')
      : page.locator('.exclusive-skill-cutin');
    await expect(target).toBeVisible();
    if (stop !== 'equipment') {
      await expect(page.locator('.exclusive-skill-sequence')).toHaveAttribute('data-exclusive-phase', stop);
    }
    if (stop === 'cutin') {
      expect(await page.locator('.sb-standing').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    }
    const cursor = await harness.getAttribute('data-replay-index');
    const content = await target.textContent();
    // Deliberate hold measurement; not an arbitrary navigation sleep.
    await page.waitForTimeout(2200);
    await expect(harness).toHaveAttribute('data-replay-index', cursor!);
    await expect(target).toBeVisible();
    expect(await target.textContent()).toBe(content);
    await resume.click();
    await expect(page.getByRole('button', { name: '一時停止', exact: true })).toBeVisible();
    await expect.poll(() => harness.getAttribute('data-replay-index')).not.toBe(cursor);
    if (stop === 'cutin') {
      // Natural completion only, no SKIP.
      await expect(harness).toHaveAttribute('data-battle-state', 'RESULT', { timeout: 150_000 });
    }
  });
}
