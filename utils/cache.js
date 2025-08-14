const NodeCache = require('node-cache');

// Initialize a new cache instance with a default TTL (Time To Live)
// This cache will store data in memory
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 }); // Default TTL 5 minutes, check every 1 minute

module.exports = {
    cache,
};