// Browser tests for the Identifier fretboard: tap, drag, keyboard and touch.
// The move rules themselves are unit tested in tests/fretboard-model.test.js;
// these check the real pointer / touch / focus wiring on the page.
const { test, expect } = require('@playwright/test');

// Baritone DGBE, as in the bug report
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('uca-tuning', 'baritone'); } catch (e) {} });
});

/** Viewport coordinates of a cell's centre (f = 0 is the open row). */
async function cell(page, s, f) {
  return page.evaluate(([s, f]) => {
    const g = FRETBOARD_GEOMETRY;
    const m = document.getElementById('fretboard-svg').getScreenCTM();
    const x = fbStringX(s), y = f === 0 ? g.openY : fbFretY(f);
    return { x: m.a * x + m.e, y: m.d * y + m.f };
  }, [s, f]);
}

const frets = (page) => page.evaluate(() => new URL(location.href).searchParams.get('frets'));
const chord = (page) => page.locator('.id-primary').textContent();

async function open(page, fretList) {
  await page.goto(`/identify.html?frets=${fretList}`);
  await page.locator('#fretboard-svg').scrollIntoViewIfNeeded();
}

async function mouseDrag(page, from, to, steps = 8) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

/** Touch gestures go through CDP so they produce real touch → pointer events. */
async function touch(page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  return {
    async drag(from, to, steps = 6) {
      await send('touchStart', [{ x: from.x, y: from.y }]);
      for (let i = 1; i <= steps; i++) {
        await send('touchMove', [{ x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps }]);
      }
      await send('touchEnd', []);
    },
  };
}

test.describe('mouse and keyboard', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('baritone D shape reads D with scale-correct progressions', async ({ page }) => {
    await open(page, '0,2,3,2');
    await expect(page.locator('.id-primary')).toHaveText('D');
    await expect(page.locator('.id-progression-chip').first()).toHaveText('I-IV-V: D - G - A');
  });

  test('clicking a dot removes it; clicking an empty fret places one', async ({ page }) => {
    await open(page, '0,2,3,2');
    const b3 = await cell(page, 2, 3);
    await page.mouse.click(b3.x, b3.y);
    expect(await frets(page)).toBe('0,2,0,2');
    await page.mouse.click(b3.x, b3.y);
    expect(await frets(page)).toBe('0,2,3,2');
    expect(await chord(page)).toBe('D');
  });

  test('clicking the open row opens a fretted string', async ({ page }) => {
    await open(page, '0,2,3,2');
    const top = await cell(page, 1, 0);
    await page.mouse.click(top.x, top.y);
    expect(await frets(page)).toBe('0,0,3,2');
  });

  test('dragging a dot along its string changes the fret', async ({ page }) => {
    await open(page, '0,2,3,2');
    await mouseDrag(page, await cell(page, 3, 2), await cell(page, 3, 5));
    expect(await frets(page)).toBe('0,2,3,5');
  });

  test('dragging sideways onto an open string moves the finger', async ({ page }) => {
    await open(page, '0,2,0,0');
    await mouseDrag(page, await cell(page, 1, 2), await cell(page, 0, 2));
    expect(await frets(page)).toBe('2,0,0,0');
  });

  test('dragging across an occupied string keeps its note', async ({ page }) => {
    await open(page, '2,3,0,0');
    await mouseDrag(page, await cell(page, 0, 2), await cell(page, 3, 2), 12);
    expect(await frets(page)).toBe('0,3,0,2');
  });

  test('dragging onto an occupied string is refused', async ({ page }) => {
    await open(page, '2,3,0,0');
    await mouseDrag(page, await cell(page, 0, 2), await cell(page, 1, 2));
    expect(await frets(page)).toBe('2,3,0,0');
  });

  test('dragging a dot above the nut opens the string', async ({ page }) => {
    await open(page, '0,2,3,2');
    const top = await cell(page, 1, 0);
    await mouseDrag(page, await cell(page, 1, 2), { x: top.x, y: top.y - 4 });
    expect(await frets(page)).toBe('0,0,3,2');
  });

  test('a press released off the board cannot be replayed later', async ({ page }) => {
    await open(page, '0,0,0,0');
    const c = await cell(page, 2, 5);
    const away = { x: 1100, y: 850 };
    await mouseDrag(page, c, away, 4);
    await mouseDrag(page, away, c, 4);
    expect(await frets(page)).toBe('0,0,0,0');
  });

  test('keyboard: arrows move the focused dot, Delete removes it', async ({ page }) => {
    await open(page, '2,3,0,0');
    await page.locator('.fb-dot-g[data-string="0"]').focus();
    await page.keyboard.press('ArrowDown');
    expect(await frets(page)).toBe('3,3,0,0');
    await expect(page.locator('.fb-dot-g[data-string="0"]')).toBeFocused();
    await page.keyboard.press('ArrowRight'); // skips occupied string 1
    expect(await frets(page)).toBe('0,3,3,0');
    await expect(page.locator('.fb-dot-g[data-string="2"]')).toBeFocused();
    await page.keyboard.press('Delete');
    expect(await frets(page)).toBe('0,3,0,0');
  });

  test('switching tuning redraws the string labels', async ({ page }) => {
    await open(page, '0,0,0,0');
    await page.click('.tuning-btn[data-tuning="standard"]');
    await expect(page.locator('.fb-string-name')).toHaveText(['G', 'C', 'E', 'A']);
    await page.click('.tuning-btn[data-tuning="baritone"]');
    await expect(page.locator('.fb-string-name')).toHaveText(['D', 'G', 'B', 'E']);
  });
});

test.describe('touch', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone only');

  test('tapping a dot removes it; tapping an empty fret places one', async ({ page }) => {
    await open(page, '0,2,3,2');
    const b3 = await cell(page, 2, 3);
    await page.touchscreen.tap(b3.x, b3.y);
    expect(await frets(page)).toBe('0,2,0,2');
    const g5 = await cell(page, 1, 5);
    await page.touchscreen.tap(g5.x, g5.y);
    expect(await frets(page)).toBe('0,5,0,2');
  });

  test('a touch drag moves the dot all the way to where the finger lifts', async ({ page }) => {
    await open(page, '0,5,0,2');
    await (await touch(page)).drag(await cell(page, 1, 5), await cell(page, 1, 7));
    expect(await frets(page)).toBe('0,7,0,2');
  });

  test('swiping on an empty part of the board scrolls the page and places nothing', async ({ page }) => {
    await open(page, '0,0,0,0');
    const start = await cell(page, 2, 7);
    const before = await page.evaluate(() => scrollY);
    await (await touch(page)).drag(start, { x: start.x, y: start.y - 200 }, 8);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 50);
    expect(await frets(page)).toBe('0,0,0,0');
  });
});
