import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto("https://www.google.com/maps/search/Lava+Jato+Belo+Horizonte")
        
        # Wait for feed
        await page.wait_for_selector('div[role="feed"]')
        
        # Get first result
        cards = await page.eval_on_selector_all('div[role="feed"] > div > div > a', "els => els.map(e => e.href)")
        if not cards:
            print("No cards found.")
            return

        print(f"Opening: {cards[0]}")
        await page.goto(cards[0])
        await page.wait_for_load_state("domcontentloaded")
        await asyncio.sleep(2) # ensure dynamically loaded elements are there
        
        # Print basic body text or grab outerHTML of the sidebar
        # to inspect classes
        html = await page.content()
        with open("/tmp/maps_dump.html", "w", encoding="utf-8") as f:
            f.write(html)
        
        print("Done. Saved to /tmp/maps_dump.html")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
