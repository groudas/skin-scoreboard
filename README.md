# Skin Scoreboard

This tool tracks the popularity of Dota 2 cosmetics by analyzing live match data from the OpenDota API. It identifies highly-spectated matches, extracts cosmetic usage from those matches, and aggregates daily statistics on which cosmetics are seen in the most watched games.

**Experimental / for educational purposes - Use with Caution**

This code is under active development and is currently **highly experimental**. It is also one of my first personal coding experiences. There will be lots of rollbacks and redesigns.

![alt text](image.png)

**Upcoming (v0.5 MVP):**
*   ~~MongoDB full migration (speedy DB queries)~~ _(dropped for now)_
*   Usage indicators (better data comprehension)
*   Marketplace price analysis (actual usefulness for the data)
*   Visualization module (better insights)

By using this software, you acknowledge it is provided at your **own risk**.

## Current Features

*   Fetches live match data from the OpenDota API.
*   Filters for matches with high spectator counts.
*   Downloads detailed data for selected matches.
*   Extracts cosmetic items used by heroes in those matches.
*   Aggregates daily popularity scores based on spectators.
*   Persists raw and processed data locally.
*   Shows final data in an interactive HTML graph (very early stage)

## Project Structure

*   `data/`: Storage for all data (raw, processed, match details, filtered data, aggregated stats).
*   `src/`: Contains the core Node.js scripts (`config.js`, `utils.js`, logical modules).
*   `package.json`: Project dependencies and scripts.
*   `run_all.bat`: Helper scripts to run processing steps sequentially.
*   `plot_cosmetics.html`: A temporary (and buggy) interface for viewing data.

## Setup

1.  **Prerequisites:** Ensure you have [Node.js](https://nodejs.org/) (includes npm) installed.
2.  **Clone Repository:** Clone this repository to your local machine.
3.  **Install Dependencies:** Navigate to the project directory in your terminal and run:
    ```bash
    npm install
    ```
4.  **Configuration:** Review `src/config.js` and adjust settings like polling intervals, or data directories if you want (not required).

## Usage

The project workflow involves two main phases: continuously fetching live data and periodically processing that data through several steps.

1.  **Start Live Data Fetching (Continuous):**
    This script (`step1_fetch_live.js`) runs indefinitely, polling the OpenDota live API every 15 minutes (default). It should be run in a separate terminal or managed by a process manager (e.g., `pm2`). Be sure your terminal is at the folder ~/src/module1, then run:
    ```bash
    node src/modules/step1_fetch_live.js
    ```

    *There is also a step1.bat that works exacly the .js file, but you can run by typing `./step1.bat` or just double clicking the file.

2.  **Run Data Processing Steps (Periodically):**
    After `step1` has collected enough data, run the subsequent steps (`step2` through `step5`) to process it. These steps are designed to be run sequentially.

    *   **Recommended:** Use the provided `run_all.bat` file to run steps 2-5 automatically.
        
    *   **Alternatively:** Run each step individually.
        ```bash
        node src/modules/step2_filter_top_matches.js
        node src/modules/step3_fetch_match_details.js
        node src/modules/step4_extract_match_data.js
        node src/modules/step5_update_database.js
        ```
3.  **Visualize Parsed Data:**
    Simple open `plot_cosmetics.html` with any browser and select either `daily_cosmetic_stats_marketable.json` or `daily_cosmetic_stats.json` files to load the data. Activate or deactivate the plotting by clicking on an item name. **Beware: the visualization tool is not optimized and is just a makeshift tool I made while finishing the rest of the code. I plan to build another visualization tool later.**
## Workflow Overview

*   `step1`: Fetches raw live match data (`data/raw/`).
*   `step2`: Filters raw data for top matches, saves a list, and moves raw files (`data/processed/filtered_live_matches.json`, `data/raw/processed/`).
*   `step3`: Downloads detailed match data for filtered matches (`data/matches/`).
*   `step4`: Extracts cosmetic usage and relevant info from match details (`data/filtered_matches/`).
*   `step5`: Reads extracted data and updates the aggregated daily statistics database (`data/database/daily_cosmetic_stats.json`).

## Notes

*   Be mindful of OpenDota API rate limits. Default settings in `config.js` are conservative.
*   Step 3 includes a check (`minimumMatchAgeHours` in `config.js`) to ensure match details are likely parsed already. I plan to add a parsing request for the unparsed matches (parse requests counts as 10 requests to Open Dota API)
*   Data from `raw`, `matches`, and `filtered_matches` directories is preserved for potential reprocessing or analysis.
