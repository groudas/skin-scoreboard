# Skin Scoreboard

This tool tracks the popularity of Dota 2 cosmetics by analyzing live match data from the OpenDota API. Then, fetches price evolution at Steam Marketplace and calculates indicators to later correlation all the data into insighful information.

**Experimental - Use with Caution**

This code is under active development and is currently **highly experimental**.

By using this software, you acknowledge it is provided at your **own risk**.

## Current Features

* Data Extraction: Open Dota: Fetches live match data, filters highly-spectated matches, downloads detailed data, extracts cosmetic usage, and aggregates daily popularity scores based on spectators. Persists raw and processed data locally.
* Data Extraction: Steam Market: *(Planned)* Fetches price history for the tracked cosmetic items.
* Indicators Calculation: *(Planned)* Calculates various performance and popularity indicators based on aggregated usage and price data.
* Correlations Calculation: *(Planned)* Analyzes correlations between item popularity, prices, and calculated indicators.
* Console Data Visualization: *(Planned)* Provides a simple terminal interface for exploring the processed data, including item indicators, correlations, and potential graphs.

## Workflow Overview

The project workflow is structured into sequential data processing components:

*   **Data Extraction: Open Dota:** This phase combines the initial steps (`step1` through `step5` in the current script structure) to fetch live data, filter, download details, extract cosmetic usage, and produce the aggregated daily statistics database (`data/database/daily_cosmetic_stats.json`) containing item popularity and match details for the day.
*   **Data Extraction: Steam Market:** *(Planned)* Takes the aggregated daily data and enriches it with current or historical price information from the Steam Market.
*   **Indicators Calculation:** *(Planned)* Processes the popularity and price data to compute various indicators for each item.
*   **Correlations Calculation:** *(Planned)* Analyzes the relationships between different data points (popularity, price, indicators) to identify correlations.
*   **Console Data Visualization:** *(Planned)* Provides an interface to query and visualize the final processed and correlated data.


## Notes

*   Be mindful of OpenDota API rate limits. Default settings in `config.js` are conservative.