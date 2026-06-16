import * as cheerio from 'cheerio';

export async function readWebsite(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Remove scripts, styles, and other non-content tags
    $('script, style, noscript, iframe, img, svg, video, audio, nav, footer, header').remove();
    
    // Extract text
    let text = $('body').text();
    
    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    // Limit to ~20000 characters to avoid token limits
    return text.substring(0, 20000);
  } catch (error: any) {
    return `Error reading website: ${error.message}`;
  }
}
