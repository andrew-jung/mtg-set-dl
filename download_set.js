const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const https = require('https');

const API_BASE_URL = 'https://api.scryfall.com';
const IMAGES_DIR = 'images';
const RATE_LIMIT_DELAY_MS = 100;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchAllCards(setCode) {
    const allCards = [];
    let nextUrl = `${API_BASE_URL}/cards/search?q=set:${setCode}+lang:en+game:paper&unique=cards`;

    console.log(`Starting card data fetch for set: ${setCode.toUpperCase()}`);

    while (nextUrl) {
        try {
            const response = await fetch(nextUrl);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API Error: ${errorData.details || response.statusText}`);
            }

            const pageData = await response.json();
            allCards.push(...pageData.data);
            console.log(`Fetched ${pageData.data.length} cards. Total so far: ${allCards.length}`);

            if (pageData.has_more) {
                nextUrl = pageData.next_page;
                await sleep(RATE_LIMIT_DELAY_MS);
            } else {
                nextUrl = null;
            }
        } catch (error) {
            console.error(`\nAn error occurred while fetching card data: ${error.message}`);
            console.error("Stopping fetch. The data may be incomplete.");
            nextUrl = null;
        }
    }

    console.log(`\nFinished fetching. Found ${allCards.length} total card entries for ${setCode.toUpperCase()}.\n`);
    return allCards;
}

async function downloadImage(url, filepath) {
    try {
        await fs.access(filepath);
        return;
    } catch (e) {
    }

    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            if (response.statusCode < 200 || response.statusCode >= 300) {
                return reject(new Error(`Failed to download ${url}. Status: ${response.statusCode}`));
            }
            const writer = fsSync.createWriteStream(filepath);
            response.pipe(writer);
            writer.on('finish', resolve);
            writer.on('error', (err) => {
                // Clean up the failed download
                fsSync.unlink(filepath, () => reject(err));
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}


async function processCardsAndImages(cards, setCode) {
    const setImagesDir = path.join(IMAGES_DIR, setCode);
    await fs.mkdir(setImagesDir, { recursive: true });

    let downloadedCount = 0;
    const totalImagesToDownload = cards.reduce((acc, card) => {
        if (card.image_uris) return acc + 1;
        if (card.card_faces) return acc + card.card_faces.filter(f => f.image_uris).length;
        return acc;
    }, 0);

    console.log(`Starting image download for ${totalImagesToDownload} images...`);

    for (const card of cards) {
        card.localImagePaths = [];

        const imageTasks = [];

        if (card.image_uris && card.image_uris.normal) {
            const imageUrl = card.image_uris.normal;
            const imageName = `${card.collector_number.replace(/\D/g, '')}${card.collector_number.replace(/\d/g, '')}-${card.id}.jpg`;
            const imagePath = path.join(setImagesDir, imageName);
            imageTasks.push(downloadImage(imageUrl, imagePath).then(() => card.localImagePaths.push(imagePath)));
        }
        else if (card.card_faces) {
            card.card_faces.forEach((face, index) => {
                if (face.image_uris && face.image_uris.normal) {
                    const imageUrl = face.image_uris.normal;
                    const faceIdentifier = index === 0 ? 'a' : 'b';
                    const imageName = `${card.collector_number.replace(/\D/g, '')}${faceIdentifier}${card.collector_number.replace(/\d/g, '')}-${card.id}.jpg`;
                    const imagePath = path.join(setImagesDir, imageName);
                    imageTasks.push(downloadImage(imageUrl, imagePath).then(() => card.localImagePaths.push(imagePath)));
                }
            });
        }
        await Promise.all(imageTasks).catch(err => console.error(err.message));
        downloadedCount += imageTasks.length;

        process.stdout.write(`\rDownloaded ${downloadedCount} of ${totalImagesToDownload} images...`);
    }

    console.log(`\n\nImage download complete. All images saved in '${setImagesDir}'.\n`);
    return cards;
}

async function main() {
    const setCode = process.argv[2];

    if (!setCode) {
        console.error("---------------------------------------------------------");
        console.error("Please provide a set code as a command-line argument.");
        console.error("Example: node download_set.js tla");
        console.error("---------------------------------------------------------");
        return;
    }

    const lowerSetCode = setCode.toLowerCase();
    const outputJsonFile = `${lowerSetCode}.json`;

    const allCards = await fetchAllCards(lowerSetCode);

    if (allCards.length > 0) {
        const cardsWithImageData = await processCardsAndImages(allCards, lowerSetCode);

        try {
            await fs.writeFile(outputJsonFile, JSON.stringify(cardsWithImageData, null, 2));
            console.log(`✅ Successfully saved all card data to '${outputJsonFile}'`);
        } catch (error) {
            console.error(`Failed to write JSON file: ${error.message}`);
        }
    } else {
        console.log("No cards were found for the set, or an error occurred. Exiting.");
    }
}

main().catch(error => {
    console.error(`An unexpected error occurred: ${error.message}`);
});