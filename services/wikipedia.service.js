const axios = require('axios');
const { cache } = require('../utils/cache');

const WIKIPEDIA_API_URL = 'https://en.wikipedia.org/w/api.php';
const WIKIPEDIA_CACHE_TTL = 3600; // Cache for 1 hour (in seconds)

/**
 * Fetches Wikipedia description for a query using search, then extract.
 * Returns an object { description: string, title: string } or null.
 * This method is more robust for finding pages with variations in names.
 * @param {string} query - The search query for Wikipedia (e.g., city name).
 * @returns {object|null} - Object containing description and title, or null if not found/error.
 */
const fetchCityDescription = async (query) => {
    const cacheKey = `wiki_desc_search_${query}`; // New cache key to reflect search-based lookup
    let cachedData = cache.get(cacheKey);

    if (cachedData) {
        return cachedData;
    }

    try {
        // Step 1: Perform a search query to find the most relevant page title
        const searchResponse = await axios.get(WIKIPEDIA_API_URL, {
            params: {
                action: 'query',
                list: 'search', // Use the search module
                srsearch: query,
                srlimit: 1, // Get only the top result
                format: 'json',
            },
            headers: {
                'User-Agent': 'UrbanAirQualityInsightsAPI/1.0 (contact@example.com) NodeJS',
            }
        });

        const searchResults = searchResponse.data.query.search;
        if (!searchResults || searchResults.length === 0) {
            return null; // No search results found
        }

        const pageTitle = searchResults[0].title; // Get the title of the top search result

        // Step 2: Fetch the extract using the found page title
        const extractResponse = await axios.get(WIKIPEDIA_API_URL, {
            params: {
                action: 'query',
                prop: 'extracts',
                exintro: true,
                explaintext: true,
                redirects: 1,
                format: 'json',
                titles: pageTitle,
            },
            headers: {
                'User-Agent': 'UrbanAirQualityInsightsAPI/1.0 (contact@example.com) NodeJS',
            }
        });

        const pages = extractResponse.data.query.pages;
        const pageId = Object.keys(pages)[0];
        const extract = pages[pageId].extract;
        const title = pages[pageId].title;

        if (extract && !pages[pageId].missing && title) {
            const firstSentenceMatch = extract.match(/^(.+?([.?!]|\n)\s)/);
            let shortDescription = firstSentenceMatch ? firstSentenceMatch[0].trim() : extract.split('\n')[0].trim();

            const maxLength = 250;
            if (shortDescription.length > maxLength) {
                shortDescription = shortDescription.substring(0, maxLength).trim();
                const lastSpace = shortDescription.lastIndexOf(' ');
                if (lastSpace > 0) {
                    shortDescription = shortDescription.substring(0, lastSpace);
                }
                shortDescription += '...';
            }

            const result = { description: shortDescription, title: title };
            cache.set(cacheKey, result, WIKIPEDIA_CACHE_TTL);
            return result;
        }
        return null;
    } catch (error) {
        console.error(`Error fetching Wikipedia description for "${query}" via search:`, error.message);
        return null;
    }
};

module.exports = {
    fetchCityDescription,
};