const pollutionService = require('../services/pollution.service');
const wikipediaService = require('../services/wikipedia.service');
const { cache } = require('../utils/cache');

const POLLUTION_CACHE_KEY_PREFIX = 'pollutedCitiesData';
const WIKIPEDIA_CACHE_TTL = 3600; // Cache Wikipedia descriptions for 1 hour (in seconds)

const getPollutedCities = async (req, res, next) => {
    try {
        const { country, page = 1, limit = 10 } = req.query;

        const parsedPage = parseInt(page);
        const parsedLimit = parseInt(limit);

        if (isNaN(parsedPage) || parsedPage < 1 || isNaN(parsedLimit) || parsedLimit < 1) {
            return res.status(400).json({ error: 'Page and limit must be positive integers.' });
        }

        let pollutionData;
        const cacheKey = `${POLLUTION_CACHE_KEY_PREFIX}_${country || 'default'}_p${parsedPage}_l${parsedLimit}`;

        pollutionData = cache.get(cacheKey);

        if (!pollutionData) {
            console.log(`Pollution data for ${country || 'all default countries'} (page ${parsedPage}, limit ${parsedLimit}) not in cache. Hitting the API now...`);
            pollutionData = await pollutionService.fetchPollutionData(country, parsedPage, parsedLimit);
            cache.set(cacheKey, pollutionData, 600);
        } else {
            console.log(`Serving pollution data for ${country || 'all default countries'} (page ${parsedPage}, limit ${parsedLimit}) from cache. Nice and fast!`);
        }

        const filteredAndEnrichedCities = [];

        if (pollutionData && Array.isArray(pollutionData.cities)) {
            const validCitiesToProcess = [];
            for (const cityEntry of pollutionData.cities) {
                const preparedCity = normalizeCityData(cityEntry);

                if (preparedCity) {
                    validCitiesToProcess.push(preparedCity);
                } else {
                    console.warn(`Filtered out corrupted or incomplete entry during initial validation: ${JSON.stringify(cityEntry)}`);
                }
            }

            const wikipediaPromises = validCitiesToProcess.map(async (city) => {
                const description = await getWikipediaDescription(city.originalName, city.country, city.lookupName);
                if (description) {
                    return {
                        name: city.originalName,
                        country: city.country,
                        pollution: city.pollution,
                        description: description,
                    };
                }
                console.warn(`City "${city.originalName}" (${city.country}) filtered out due to no relevant Wikipedia description.`);
                return null;
            });

            const citiesWithDescriptions = (await Promise.all(wikipediaPromises)).filter(city => city !== null);

            citiesWithDescriptions.sort((a, b) => {
                if (b.pollution !== a.pollution) {
                    return b.pollution - a.pollution;
                }
                return a.name.localeCompare(b.name);
            });

            filteredAndEnrichedCities.push(...citiesWithDescriptions);
        }

        res.json({
            page: parsedPage,
            limit: parsedLimit,
            total: filteredAndEnrichedCities.length,
            cities: filteredAndEnrichedCities,
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Validates and prepares city data, returning the original name for output.
 * A cleaned name is prepared for Wikipedia lookup, removing known non-city descriptors.
 * @param {object} data - The raw city object from the pollution API.
 * @returns {object|null} - Validated city data with original name and lookup name, or null if invalid.
 */
const normalizeCityData = (data) => {
    if (!data || typeof data.name !== 'string' || data.name.trim() === '') {
        return null;
    }
    if (typeof data.country !== 'string' || data.country.trim() === '') {
        return null;
    }
    const pollutionValue = parseFloat(data.pollution);
    if (isNaN(pollutionValue) || pollutionValue < 0) {
        return null;
    }

    const originalName = data.name.trim();
    let lookupName = originalName;

    // 1. Remove text in parentheses (e.g., "(Zone)", "(District)") for lookupName
    lookupName = lookupName.replace(/\s*\(.+\)\s*/g, '').trim();

    // 2. Standardize casing for lookup (e.g., "wArSAW" -> "Warsaw").
    // This helps Wikipedia's search, but preserves diacritics and hyphens.
    lookupName = lookupName.split(' ').map(word => {
        if (word.length === 0) return '';
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ').trim();

    // Remove any extra spaces that might result from replacements for lookup
    lookupName = lookupName.replace(/\s+/g, ' ').trim();

    // Basic filter for truly invalid names after minimal cleaning (for lookup)
    if (lookupName === '' || /^[0-9]+$/.test(lookupName) || lookupName.length <= 1) { // Allow "A" for city names like "A Coruña"
        return null;
    }

    return {
        originalName: originalName, // Store original name for final output
        lookupName: lookupName, // Use this for Wikipedia lookups
        country: data.country.trim(),
        pollution: pollutionValue,
    };
};

/**
 * Fetches Wikipedia description for a city, using cache.
 * Now includes robust validation to ensure it's a relevant populated place.
 * @param {string} originalName - The original name of the city (for output if found).
 * @param {string} countryName - The name of the country.
 * @param {string} lookupName - The cleaned name for Wikipedia queries.
 * @returns {string|null} - The Wikipedia description or null if not found/error or not a valid location.
 */
const getWikipediaDescription = async (originalName, countryName, lookupName) => {
    // Prioritize queries that are most likely to be correct.
    const searchQueries = [
        `${originalName}, ${countryName}`, // Original name + country (best chance for exact match)
        `${lookupName}, ${countryName}`, // Cleaned name + country
        originalName, // Original name only
        lookupName // Cleaned name only
    ];

    // Map of country codes to their full names and common variations for checking relevance
    const countryNames = {
        'PL': ['Poland', 'Polish'],
        'DE': ['Germany', 'German'],
        'ES': ['Spain', 'Spanish'],
        'FR': ['France', 'French'],
    };
    const relevantCountryTerms = countryNames[countryName.toUpperCase()] || [];
    const lowerCountryTerms = relevantCountryTerms.map(term => term.toLowerCase());


    for (const query of searchQueries) {
        const cacheKey = `wiki_${query}`;
        let description = cache.get(cacheKey);

        if (description) {
            return description;
        }

        const wikiData = await wikipediaService.fetchCityDescription(query);
        if (wikiData && wikiData.description) {
            const lowerDesc = wikiData.description.toLowerCase();
            const lowerTitle = wikiData.title.toLowerCase();

            // --- Strong Negative Indicators (if any of these are present, filter it out) ---
            const strongNegativeKeywords = [
                'may refer to:', 'disambiguation page', 'film', 'album', 'number', 'symbol',
                'species', 'river', 'mountain range', 'historical region', 'concept', 'theory',
                'organization', 'company', 'product', 'mathematical', 'scientific', 'list of',
                'is a character in', 'is a fictional', 'is an abstract', 'is a type of', 'refers to',
                'is a genus of', 'is a surname', 'is a given name', 'is a song', 'is an episode',
                'is a novel by', 'is a play by', 'is a television series', 'is a video game',
                'is a computer program', 'is an acronym for', 'is a chemical element', 'is a unit of',
                'dictator', 'tank series', 'medicine', 'monitoring', 'political party', 'streaming service', 'election', 'polling',
                'aircraft', 'military', 'weapon', 'vehicle', 'disease', 'condition', 'medical parameter', 'observation of', 'historical figure',
                'fictional character', 'fictional place', 'fictional entity', 'corporate entity', 'software', 'platform', 'service',
                // Explicitly added based on problematic examples and their descriptions:
                'industrial region', 'power plant', 'monitoring station', 'industrial zone', 'unknown point',
                'facility', 'station', 'complex', 'area (disambiguation)', 'site (disambiguation)', 'point (disambiguation)',
                'alpha (disambiguation)', 'b (disambiguation)', 'c (disambiguation)', 'd (disambiguation)', 'e (disambiguation)', // Generic single letters
                'number (disambiguation)', 'number theory', 'mathematical constant', 'mathematical concept',
                'medical condition', 'medical device', 'medical procedure', 'medical treatment', 'medical system',
                'military unit', 'military base', 'military operation', 'military vehicle', 'military aircraft',
                'political party', 'political movement', 'political organization', 'political system', 'political theory',
                'streaming service', 'television series', 'video game', 'software platform', 'software service',
                'historical event', 'historical period', 'historical figure', 'historical site',
                'geological feature', 'body of water', 'mountain range', 'natural feature'
            ];
            const isStrongNegativeMatch = strongNegativeKeywords.some(keyword => lowerDesc.includes(keyword));
            const isTitleStrongNegativeMatch = strongNegativeKeywords.some(keyword => lowerTitle.includes(keyword));

            // --- Country Relevance Check ---
            const isCountryRelevant = lowerCountryTerms.some(term => lowerDesc.includes(term) || lowerTitle.includes(term)) ||
                                      lowerDesc.includes(countryName.toLowerCase()) || lowerTitle.includes(countryName.toLowerCase());

            // --- Content Relevance to Query (Crucial check) ---
            const isContentRelevantToQuery =
                (lowerDesc.includes(originalName.toLowerCase()) || lowerTitle.includes(originalName.toLowerCase())) ||
                (lowerDesc.includes(lookupName.toLowerCase()) || lowerTitle.includes(lookupName.toLowerCase()));


            // --- Final Decision Logic ---
            // This is the most inclusive logic while still attempting to filter out pure irrelevance.
            if (isCountryRelevant && isContentRelevantToQuery && !isStrongNegativeMatch && !isTitleStrongNegativeMatch) {
                cache.set(cacheKey, wikiData.description, WIKIPEDIA_CACHE_TTL);
                return wikiData.description;
            } else {
                console.warn(`Wikipedia description for "${query}" filtered due to: ` +
                             `CountryRelevant: ${isCountryRelevant}, ` +
                             `ContentRelevantToQuery: ${isContentRelevantToQuery}, ` +
                             `StrongNegativeMatch: ${isStrongNegativeMatch}, ` +
                             `TitleStrongNegativeMatch: ${isTitleStrongNegativeMatch}.`);
            }
        }
    }

    return null;
};

module.exports = {
    getPollutedCities,
};