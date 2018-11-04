const puppeteer = require('puppeteer');
const Datastore = require('nedb');
const TelegramBot = require('node-telegram-bot-api');
const argParser = require('commander');

const bazarakiUrl = 'https://www.bazaraki.com/' +
    'real-estate/houses-and-villas-rent/' +
    'number-of-bedrooms---2/number-of-bedrooms---3/type---5/' +
    'lemesos-district-limassol/' +
    '?price_max=1500';
const topAdSelector = '#listing > section > div.wrap > ' +
    'div.list-announcement-left > div.list-announcement-assortiments ' +
    '> div > div.list-title__top-container > div > a';
const simpleAdSelector = '#listing > section > div.wrap > ' +
    'div.list-announcement-left > div.list-announcement-assortiments ' +
    '> ul.list-simple__output.js-list-simple__output > li > a';
const nextBtnSelector = 'a.number-list-next.js-page-filter.number-list-line';

argParser
    .version('0.1.0')
    .option('-t, --token <n>', 'Telegram token')
    .option('-c, --chat <n>', 'Telegram chat', parseInt)
    .option('-e, --exc <n>', 'Telegram error chat', parseInt)
    .parse(process.argv);

const tgBotToken = argParser.token;
const tgChat = argParser.chat;
const exceptionChat = argParser.exc;
const tgBot = new TelegramBot(tgBotToken);


function getDb() {
    const db = new Datastore({filename : '/home/rus/bazaraki/links'});
    db.loadDatabase();
    return db;
}

async function getAdLinks() {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.setViewport({width: 1280, height: 800});
        let url = bazarakiUrl;
        let links = [];
        do {
            const navigationPromise = page.waitForNavigation();
            await page.goto(url, {waitUntil: 'load', timeout: 60000});
            await navigationPromise;
            // Find ads on the page
            let adLinks = await page.evaluate((topAdSelector, simpleAdSelector) => {
                let topAdLinks = Array.from(document.querySelectorAll(topAdSelector));
                let simpleAdLinks = Array.from(document.querySelectorAll(simpleAdSelector));
                return topAdLinks.map(link => link.href).concat(simpleAdLinks.map(link => link.href));
            }, topAdSelector, simpleAdSelector);
            links = links.concat(adLinks);
            // Find next url
            url = await page.evaluate((nextBtnSelector) => {
                var nextBtn = document.querySelector(nextBtnSelector);
                if (nextBtn == null) {
                    return null;
                } else {
                    return document.querySelector(nextBtnSelector).href
                }
            }, nextBtnSelector);
        } while (url != null);
        await browser.close();
        return links;
    } catch (error) {
        await tgBot.sendMessage(exceptionChat, error.toString());
        throw error;
    }
}

(async () => {
    const links = await getAdLinks();
    const db = getDb();
    links.forEach((link) => {
        db.findOne({link: link}, async (err, record) => {
            if (record == null) {
                // Send in Tg;
                await tgBot.sendMessage(tgChat, link);
                // Save in neDB;
                db.insert({link: link, added: (new Date()).getTime()})
            }
        });
    });
})();
