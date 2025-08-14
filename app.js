const express = require('express');
const dotenv = require('dotenv');
const citiesController = require('./controllers/cities.controller');
const { cache } = require('./utils/cache');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/cities', citiesController.getPollutedCities);

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Clear cache at a defined interval
setInterval(() => {
    cache.clear();
    console.log('Cache cleared.');
}, 30 * 60 * 1000); // 30 minutes

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;