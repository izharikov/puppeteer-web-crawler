const puppeteer = require('puppeteer');
const Multiprogress = require("multi-progress");
const multi = new Multiprogress(process.stderr);

const errorPages = [];

const crawlPage = async (page, pageUrl, filterLinks, prefix) => {
    // console.log(prefix, 'visiting', pageUrl)
    try {
        const response = await page.goto(pageUrl, {
            timeout: 0
        });
        if( response == null || response.status() != 200){
            errorPages.push(pageUrl);
        }
        let items = await page.evaluate(() => {
            let ret = [];
            for (let item of document.querySelectorAll('a')) {
                console.log(item)
                let href = item.getAttribute("href");
                ret.push(href);
            }
            return ret;
        });
        items = items.filter(filterLinks);
        return items;
    } catch (err) {
        console.error(err);
    }
    return [];
}

const crawl = async (browser, firstPage, enableWebp, viewPortSettings, prefix) => {
    const progressBar = multi.newBar(prefix + '  crawling [:bar] :current/:total (:percent) :etas. Link: :link', {
        complete: '=',
        incomplete: ' ',
        width: 30,
        total: 1
    });
    const filterLinks = (url) => url && (url.startsWith(firstPage) || url.startsWith('/') && !url.includes('/-/media'));
    let linksToVisit = [firstPage];
    let visitedLinks = [];
    const browserPage = await browser.newPage();
    await browserPage.setRequestInterception(true);
    browserPage.on('request', request => {
        const resourceType = request.resourceType();
        if (['stylesheet', 'font'].indexOf(resourceType) > -1) {
            request.abort();
        } else {
            if (request.resourceType() == 'document' || request.resourceType() == 'css' || request.resourceType() == 'image') {
                if (!enableWebp) {
                    let headers = { ...request.headers() };
                    // Override headers
                    if (request.resourceType() == 'image') {
                        headers['accept'] = 'image/png, image/svg+xml, image/*;q=0.8, */*;q=0.5'
                    }
                    request.continue({ headers });
                } else {
                    request.continue();
                }
            } else {
                request.abort();
            }
        }
    });
    browserPage.setViewport(viewPortSettings);
    const executeAsync = async () => {
        let link = linksToVisit.pop();
        if (link) {
            let urls = await crawlPage(browserPage, link, filterLinks, prefix);
            visitedLinks.push(link);
            for (let url of urls) {
                if (url.startsWith('/')) {
                    url = firstPage + url;
                }
                if (link != url && visitedLinks.indexOf(url) < 0 && linksToVisit.indexOf(url) < 0) {
                    linksToVisit.push(url);
                }
            }
            progressBar.total = visitedLinks.length + linksToVisit.length;
            let cut = link.substring(firstPage.length);
            const maxLengh = 50;
            progressBar.tick(1, {
                link: cut.substring(0, maxLengh - 3) + (cut.substring(maxLengh - 3, maxLengh + 1).length > 3 ? "..." : cut.substring(maxLengh - 3, maxLengh))
            });
            await executeAsync();
        }
    }
    await executeAsync();
}

const config = require("./config.json");

const launchCrawl = async (enableWebp, viewPortSettings, prefix) => {
    const browser = await puppeteer.launch();
    const firstPage = config.url;
    await crawl(browser, firstPage, enableWebp, viewPortSettings, prefix)
    await browser.close();
};

(async () => {
    const mobileViewport = {
        width: 640,
        height: 480,
        deviceScaleFactor: 1
    };
    const pcViewport = {
        width: 1920,
        height: 1080
    }
    await Promise.all([
        // mobiles + webp
        launchCrawl(true, mobileViewport, 'mb+'),
        launchCrawl(false, mobileViewport, 'mb-'),
        launchCrawl(false, pcViewport, 'pc-'),
        launchCrawl(true, pcViewport, 'pc+'),
    ]
    )
    console.log("Error pages", [...new Set(errorPages)])
})();