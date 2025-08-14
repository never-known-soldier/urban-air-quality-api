const axios = require('axios');
const { cache } = require('../utils/cache');
const dotenv = require('dotenv');

dotenv.config();

const BASE_URL = process.env.POLLUTION_API_BASE_URL || 'https://be-recruitment-task.onrender.com';
const USERNAME = process.env.POLLUTION_API_USERNAME;
const PASSWORD = process.env.POLLUTION_API_PASSWORD;

const AUTH_TOKEN_CACHE_KEY = 'authToken';
const TOKEN_REFRESH_BUFFER = 60; // Refresh token 60 seconds before it actually expires

/**
 * Calls the login API to obtain a new Bearer Token.
 * Caches the token with its expiry time.
 * @returns {string} The Bearer Token.
 * @throws {Error} If login fails.
 */
const getAuthToken = async () => {
    let tokenData = cache.get(AUTH_TOKEN_CACHE_KEY);

    // Check if token exists and is still valid (with a buffer for refresh)
    if (tokenData && tokenData.token && tokenData.expiresAt > (Date.now() / 1000 + TOKEN_REFRESH_BUFFER)) {
        console.log('Serving auth token from cache.');
        return tokenData.token;
    }

    console.log('Auth token not in cache or expired. Attempting to log in...');
    try {
        const response = await axios.post(`${BASE_URL}/auth/login`, {
            username: USERNAME,
            password: PASSWORD,
        }, {
            headers: {
                'Content-Type': 'application/json',
            },
        });

        // Correctly parse 'expiresIn' from the response
        const { token, expiresIn } = response.data;

        if (!token || typeof expiresIn === 'undefined') { // Check for undefined, as 0 is a valid number
            throw new Error('Login API did not return a valid token or expiry (expiresIn).');
        }

        const expiresInSeconds = parseInt(expiresIn, 10);
        if (isNaN(expiresInSeconds) || expiresInSeconds <= 0) {
            throw new Error('Invalid expiresIn value received from login API.');
        }

        // Cache the token with its expiry time.
        // The TTL for node-cache should be slightly less than the actual token expiry
        // to account for network delays and ensure we refresh before it's truly invalid.
        const cacheTTL = expiresInSeconds - TOKEN_REFRESH_BUFFER; // Refresh 60 seconds before actual expiry
        if (cacheTTL <= 0) { // Ensure TTL is positive
            console.warn('Token expiry is too short for a safe refresh buffer. Setting minimum cache TTL.');
            cache.set(AUTH_TOKEN_CACHE_KEY, { token, expiresAt: Date.now() / 1000 + expiresInSeconds }, 10); // Cache for 10 seconds if very short
        } else {
            cache.set(AUTH_TOKEN_CACHE_KEY, { token, expiresAt: Date.now() / 1000 + expiresInSeconds }, cacheTTL);
        }

        console.log(`Successfully obtained and cached new auth token. Expires in ${expiresInSeconds} seconds.`);
        return token;

    } catch (error) {
        console.error('Error during login to obtain token:', error.message);
        if (error.response) {
            console.error('Login API response data:', error.response.data);
            console.error('Login API response status:', error.response.status);
            if (error.response.status === 401) {
                throw new Error('Login failed: Invalid username or password for pollution API.');
            }
        }
        throw new Error('Failed to obtain authentication token from login API.');
    }
};

module.exports = {
    getAuthToken,
};
