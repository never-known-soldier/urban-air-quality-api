const axios = require('axios');
const authService = require('./auth.service');

const BASE_URL = process.env.POLLUTION_API_BASE_URL || 'https://be-recruitment-task.onrender.com';
const AVAILABLE_COUNTRIES = ['PL', 'DE', 'ES', 'FR'];

/**
 * Fetches pollution data from the API for a specific page and limit.
 * If no countryCode is provided, it fetches the first page/limit for all available countries.
 * @param {string} [countryCode] - Optional country code (e.g., 'PL', 'DE').
 * @param {number} [page=1] - The page number to fetch.
 * @param {number} [limit=10] - The number of results per page.
 * @returns {object} - Aggregated city data for the requested page/limit, including the total count from API.
 * @throws {Error} - If API call fails or authentication issues.
 */
const fetchPollutionData = async (countryCode, page = 1, limit = 10) => {
    let allCitiesForRequestedPage = [];
    let totalFromAPIForQuery = 0; // This will store the 'total' from the API for the *specific query*

    try {
        const authToken = await authService.getAuthToken();

        const countriesToQuery = countryCode ? [countryCode.toUpperCase()] : AVAILABLE_COUNTRIES;

        // Use Promise.all to fetch data for all *selected* countries concurrently for the requested page/limit
        const countryDataPromises = countriesToQuery.map(async (country) => {
            if (!AVAILABLE_COUNTRIES.includes(country)) {
                console.warn(`Skipping invalid or unsupported country code: ${country}`);
                return { cities: [], total: 0 }; // Return empty for invalid countries
            }

            console.log(`Fetching pollution data for ${country}: page ${page}, limit ${limit}...`);
            const response = await axios.get(`${BASE_URL}/pollution`, {
                params: {
                    country: country,
                    page: page,
                    limit: limit,
                },
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                },
            });

            const { meta, results } = response.data;
            console.log(`Meta: ${JSON.stringify(response.data)}`);
            if (!results) {
                return { cities: [], total: meta.totalPages || 0 };
            }

            // Add the country property to each city object immediately upon fetching
            const citiesWithCountry = results.map(city => ({
                ...city,
                country: country
            }));
            return { cities: citiesWithCountry, total: meta.totalPages * limit }; // Return cities and the total for this specific country query
        });

        const resultsPerCountry = await Promise.all(countryDataPromises);

        // Aggregate results and sum up the total
        resultsPerCountry.forEach(countryResult => {
            allCitiesForRequestedPage = allCitiesForRequestedPage.concat(countryResult.cities);
            totalFromAPIForQuery += countryResult.total;
        });

        return {
            cities: allCitiesForRequestedPage,
            page: page,
            limit: limit,
            total: totalFromAPIForQuery
        };

    } catch (error) {
        console.error('Error fetching pollution data:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
            console.error('Response status:', error.response.status);
            if (error.response.status === 401) {
                console.error('Authentication failed for pollution API: Token might be expired or invalid. Please check login credentials.');
            } else if (error.response.status === 400 && error.response.data && error.response.data.error) {
                 console.error(`API returned 400 for country code. Error: ${error.response.data.error}`);
            }
        }
        throw new Error('Failed to fetch pollution data from API.');
    }
};

module.exports = {
    fetchPollutionData,
};