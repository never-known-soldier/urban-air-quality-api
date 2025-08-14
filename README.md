# Urban Air Quality API

This project is a Node.js Express backend service designed to process and deliver real-time urban air quality data. It fetches raw pollution data, validates and cleans it, then enhances each valid city entry with a brief description from Wikipedia.

---

## What it Does

The service exposes a `GET /cities` endpoint.
* **`GET /cities`**: Fetches pollution data for a predefined list of countries (`PL`, `DE`, `ES`, `FR`).
* **`GET /cities?country=CODE`**: Fetches pollution data specifically for the provided `CODE` (e.g., `?country=PL`).

The endpoint then intelligently filters corrupted or non-city entries, adds short Wikipedia descriptions for valid cities, and returns a structured JSON response, grouped by country. It handles data corruption and manages API rate limits using in-memory caching, all built with clean, maintainable Node.js/Express code.

---

## How to Get It Running

1.  **Clone the repo:**
    ```bash
    git clone https://github.com/never-known-soldier/urban-air-quality-api
    cd urban-air-quality-api
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Set up environment variables:** Create a `.env` file in the project root:
    ```
    POLLUTION_API_BASE_URL=https://be-recruitment-task.onrender.com
    POLLUTION_API_USERNAME=testuser
    POLLUTION_API_PASSWORD=testpass
    PORT=3000
    ```
4.  **Start the server:**
    ```bash
    npm start
    ```
    Access the endpoint at: `http://localhost:3000/cities`

    To test with a specific country: `http://localhost:3000/cities?country=PL`

---

## How I Determine a "City"

My approach to identifying a valid city from the raw data involves two layers: **Basic Checks** ensure proper `name`, `country`, and `pollution` values. Then, **Wikipedia Validation** cross-references entries with the Wikipedia API; a valid introductory description confirms a legitimate city, filtering out typos or non-existent places.

---

## Assumptions & A Few Notes

* **Authentication:** The pollution API uses a Bearer Token for authentication. This token is dynamically obtained by calling the `/auth/login` endpoint using the provided `POLLUTION_API_USERNAME` and `POLLUTION_API_PASSWORD`, and then cached in memory for its validity period to minimize login calls.
* **Pollution Data Fetching (Country Parameter):** The `/pollution` endpoint requires a `country` query parameter.
    * If no `country` is specified in the client request to `/cities`, the service iterates through a **predefined list of available countries** (`PL`, `DE`, `ES`, `FR`) to gather data.
    * If a `country` is specified, it fetches data only for that country.
* **Pagination Handled**: The service automatically fetches all pages for each queried country from the `/pollution` endpoint to get the complete dataset.
* **Caching is In-Memory**: Cache is ephemeral and not distributed.
* **Wikipedia Snippets**: Short introductory text is used for descriptions.
* **No Fuzzy Matching**: System doesn't correct minor city name typos.
