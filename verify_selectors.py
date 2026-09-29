import asyncio
import re
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        print("Buscando...")
        await page.goto("https://www.google.com/maps/place/CONCEPT+BARREIRO+EST%C3%89TICA+AUTOMOTIVA/data=!4m7!3m6!1s0xa6bd3c520b8b29:0xb5818d73177cc824!8m2!3d-19.978956!4d-44.012586!16s%2Fg%2F11v5jgvq_f!19sChIJKYsLUjy9pgARJMh8F3ONgbU?authuser=0&hl=pt-BR")
        await page.wait_for_load_state("domcontentloaded")
        await asyncio.sleep(2)
        
        script = """() => {
            const getAttributeOrEmpty = (selector, attr) => {
                const el = document.querySelector(selector);
                return el ? el.getAttribute(attr) || '' : '';
            };
            const getTextOrEmpty = (selector) => {
                const el = document.querySelector(selector);
                return el ? el.innerText.trim() : '';
            };
            
            // Site: Look for any link that doesn't go to google
            const links = Array.from(document.querySelectorAll('a[href^="http"]'));
            const siteLink = links.find(l => !l.href.includes('google.com'));
            const site = siteLink ? siteLink.href : '';
            
            // Rating: By text or aria-label
            const ratingEl = document.querySelector('div.F7nice') || document.querySelector('[aria-label*="estrelas"]');
            const ratingText = ratingEl ? (ratingEl.innerText || ratingEl.getAttribute('aria-label')) : '';
            
            return {
                site: site,
                rating_raw: ratingText,
                name: getTextOrEmpty('h1'),
                endereco: getTextOrEmpty('button[data-item-id="address"]'),
                telefone: getTextOrEmpty('button[data-item-id*="phone:tel"]'),
                categoria: getTextOrEmpty('button.DkEaL')
            };
        }"""
        
        res = await page.evaluate(script)
        print("RESULTADOS:")
        print(res)
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
