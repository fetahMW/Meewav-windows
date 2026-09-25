import { expect, test } from '@playwright/test'

const VIEWPORTS = [
  { width: 320, height: 760 },
  { width: 375, height: 812 },
  { width: 768, height: 900 },
  { width: 1024, height: 900 },
  { width: 1440, height: 1000 },
  { width: 1832, height: 1050 },
] as const

for (const viewport of VIEWPORTS) {
  test(`les cartes projets restent lisibles à ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await page.goto('/tremplin/decouvrir')

    const rail = page.locator('.tremplin-home-rail', {
      has: page.getByRole('heading', { name: 'Projets à découvrir' }),
    })
    await expect(rail).toBeVisible()
    await expect(rail.getByText('Soutien MW disponible')).toHaveCount(0)
    await expect(rail.getByText('Nouveau projet', { exact: true })).toHaveCount(0)
    await expect(rail.getByRole('button', { name: 'Voir tous les projets' })).toBeVisible()
    if (viewport.width > 768) {
      await expect(rail.getByRole('button', { name: 'Artistes suivants' })).toBeVisible()
      const nextArrowOpacity = await rail.getByRole('button', { name: 'Artistes suivants' }).evaluate((button) => Number(getComputedStyle(button).opacity))
      expect(nextArrowOpacity).toBeGreaterThan(0.5)
    }

    const originalCards = rail.locator('[data-tremplin-loop-copy="original"] .tremplin-home-card')
    await expect(originalCards.first()).toBeVisible()
    await expect(originalCards.first().locator('.tremplin-home-card__audio')).toContainText(/^Écouter \d+:/)
    await expect(originalCards.first().locator('.tremplin-home-card__follow')).toHaveAttribute('aria-label', /^(Suivre|Ne plus suivre) /)

    const brokenButtons = await rail.locator('button:visible').evaluateAll((buttons) => buttons.flatMap((button) => {
      const element = button as HTMLElement
      const style = getComputedStyle(element)
      const label = element.getAttribute('aria-label') ?? element.textContent?.trim() ?? ''
      const clipped = element.scrollWidth > element.clientWidth + 1
      const ellipsed = style.textOverflow === 'ellipsis' || label.includes('…')
      const wrapped = element.classList.contains('tremplin-home-card__audio') && element.scrollHeight > 50
      return clipped || ellipsed || wrapped ? [{ label, clipped, ellipsed, wrapped }] : []
    }))
    expect(brokenButtons, JSON.stringify(brokenButtons)).toEqual([])

    const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(pageOverflow).toBeLessThanOrEqual(2)

    if (viewport.width === 1832) {
      const viewportBox = await rail.locator('.tremplin-home-rail__viewport').boundingBox()
      const cardBoxes = await originalCards.evaluateAll((cards) => cards.slice(0, 5).map((card) => {
        const rect = card.getBoundingClientRect()
        return { left: rect.left, right: rect.right, width: rect.width }
      }))
      expect(viewportBox).not.toBeNull()
      expect(cardBoxes).toHaveLength(5)
      for (const box of cardBoxes) {
        expect(box.width).toBeGreaterThanOrEqual(286)
        expect(box.left).toBeGreaterThanOrEqual((viewportBox?.x ?? 0) - 1)
        expect(box.right).toBeLessThanOrEqual((viewportBox?.x ?? 0) + (viewportBox?.width ?? 0) + 1)
      }
    }

    await testInfo.attach(`projets-${viewport.width}px`, {
      body: await rail.screenshot(),
      contentType: 'image/png',
    })
  })
}

test('Voir tous les projets ouvre un mur abondant et le charge au défilement', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/tremplin')

  const projectsSection = page.locator('.tremplin-gateway__spotlights')
  await projectsSection.getByRole('button', { name: 'Voir tous les projets' }).click()
  await expect(page).toHaveURL(/\/tremplin\/decouvrir\?collection=watchlist$/)

  const wall = page.locator('.tremplin-home-wall')
  const results = wall.locator('.tremplin-home-wall__results')
  const cards = results.locator('.tremplin-home-card')
  await expect(wall.getByRole('heading', { name: 'Tous les projets du Tremplin' })).toBeVisible()
  await expect(wall.getByText(/\d+ projets/)).toBeVisible()
  await expect(cards).toHaveCount(24)

  const firstPageFamilies = await cards.evaluateAll((items) => items.map((item) => item.getAttribute('data-project-family')))
  expect(firstPageFamilies.filter((family) => family === 'voice')).toHaveLength(18)
  expect(firstPageFamilies.filter((family) => family === 'instrument')).toHaveLength(3)
  expect(firstPageFamilies.filter((family) => family === 'dj')).toHaveLength(3)

  const scrollbar = await results.evaluate((element) => {
    const base = getComputedStyle(element)
    const thumb = getComputedStyle(element, '::-webkit-scrollbar-thumb')
    return {
      color: base.scrollbarColor,
      thumbBackground: thumb.backgroundImage,
      scrollable: element.scrollHeight > element.clientHeight,
    }
  })
  expect(scrollbar.scrollable).toBe(true)
  expect(scrollbar.color).toContain('rgb(157, 108, 255)')
  expect(scrollbar.thumbBackground).toContain('linear-gradient')

  await results.evaluate((element) => { element.scrollTop = element.scrollHeight })
  await expect.poll(() => cards.count()).toBeGreaterThan(24)
  const afterFirstScroll = await cards.count()
  await results.evaluate((element) => { element.scrollTop = element.scrollHeight })
  await expect.poll(() => cards.count()).toBeGreaterThan(afterFirstScroll)

  const artistIds = await cards.evaluateAll((items) => items.map((item) => item.getAttribute('data-artist-id')))
  expect(new Set(artistIds).size).toBe(artistIds.length)
  expect(artistIds.length).toBeGreaterThanOrEqual(70)

  const lastLoadedCard = cards.last()
  await lastLoadedCard.scrollIntoViewIfNeeded()
  const savedWallScrollTop = await results.evaluate((element) => element.scrollTop)
  expect(savedWallScrollTop).toBeGreaterThan(100)
  await page.waitForTimeout(100)
  await lastLoadedCard.getByRole('button', { name: /^Ouvrir le profil de / }).click()
  await expect(page).toHaveURL(/\/tremplin\/artistes\//)
  const storedWallSession = await page.evaluate(() => JSON.parse(window.sessionStorage.getItem('meewav:tremplin:project-wall-session') ?? 'null'))
  expect(storedWallSession).toMatchObject({ visibleCount: artistIds.length, scrollTop: savedWallScrollTop })
  await page.getByRole('button', { name: 'Retour à Découvrir' }).click()
  await expect(page).toHaveURL(/\/tremplin\/decouvrir\?collection=watchlist$/)
  await expect.poll(() => cards.count()).toBeGreaterThanOrEqual(artistIds.length)
  await expect.poll(async () => Math.abs(await results.evaluate((element) => element.scrollTop) - savedWallScrollTop)).toBeLessThan(900)

  const brokenButtons = await wall.locator('button:visible').evaluateAll((buttons) => buttons.flatMap((button) => {
    const element = button as HTMLElement
    const label = element.getAttribute('aria-label') ?? element.textContent?.trim() ?? ''
    const style = getComputedStyle(element)
    return element.scrollWidth > element.clientWidth + 1 || style.textOverflow === 'ellipsis' || label.includes('…')
      ? [label]
      : []
  }))
  expect(brokenButtons).toEqual([])

  await testInfo.attach('mur-projets-1440px', {
    body: await wall.screenshot(),
    contentType: 'image/png',
  })
})
