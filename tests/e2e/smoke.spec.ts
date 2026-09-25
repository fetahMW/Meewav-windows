import { expect, test } from '@playwright/test'

test('the web application renders without a blank document', async ({ page }) => {
  await page.goto('/auth')

  await expect(page.locator('body')).toBeVisible()
  await expect(page.locator('#root')).not.toBeEmpty()
})
