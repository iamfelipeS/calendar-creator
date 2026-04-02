import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function renderCalendar(outputPath = 'calendar.png', month = 'ABRIL', year = '2026', customMatches = null) {
    const htmlPath = path.join(__dirname, 'calendar-template.html');
    
    console.log('Starting Puppeteer...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Set viewport to match Instagram story aspect ratio
    await page.setViewport({
        width: 1080,
        height: 1350,
        deviceScaleFactor: 1
    });
    
    console.log(`Loading HTML from: ${htmlPath}`);
    await page.goto('file://' + htmlPath, { waitUntil: 'networkidle0' });
    
    // Default matches if none provided
    const matches = customMatches || [
        { day: 2, homeTeam: 'Palmeiras', awayTeam: 'Corinthians' },
        { day: 7, homeTeam: 'São Paulo', awayTeam: 'Palmeiras' },
        { day: 12, homeTeam: 'Palmeiras', awayTeam: 'Flamengo' },
        { day: 18, homeTeam: 'Botafogo', awayTeam: 'Palmeiras' },
        { day: 25, homeTeam: 'Palmeiras', awayTeam: 'Grêmio' },
    ];
    
    // Update calendar with custom values
    console.log(`Updating calendar: ${month} ${year} with ${matches.length} matches`);
    await page.evaluate((month, year, matches) => {
        window.updateCalendar(month, year, 30, 2, matches);
    }, month, year, matches);
    
    // Wait for rendering
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Take screenshot
    const fullPath = path.join(__dirname, outputPath);
    console.log(`Rendering to: ${fullPath}`);
    await page.screenshot({
        path: fullPath,
        type: 'png',
        fullPage: true,
        omitBackground: false
    });
    
    console.log('✓ Calendar rendered successfully!');
    console.log(`  File: ${outputPath}`);
    console.log(`  Matches: ${matches.map(m => `${m.day}`).join(', ')}`);
    
    await browser.close();
}

// Get arguments from command line
const args = process.argv.slice(2);
const outputPath = args[0] || 'calendar_abril_2026.png';
const month = args[1] || 'ABRIL';
const year = args[2] || '2026';

renderCalendar(outputPath, month, year).catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
