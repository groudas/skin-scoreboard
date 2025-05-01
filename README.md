# Dota 2 Cosmetic Popularity Tracker

This project tracks the popularity of Dota 2 cosmetics by analyzing live match data from the OpenDota API. It identifies highly-spectated matches, extracts cosmetic usage from those matches, and aggregates daily statistics on which cosmetics are seen in the most watched games.

**Experimental - Use with Caution**
>
> This code is under active development and is currently **highly experimental**.
>
> **Upcoming (v0.5 MVP):**
> *   MongoDB full migration (speedy DB queries)
> *   Usage indicators (better data comprehension)
> *   Marketplace price analysis (actual usefulness for the data)
>
> By using this software, you acknowledge it is provided at your **own risk**.

## Current Features

*   Fetches live match data from the OpenDota API.
*   Filters for matches with high spectator counts.
*   Downloads detailed data for selected matches.
*   Extracts cosmetic items used by heroes in those matches.
*   Aggregates daily popularity scores based on spectators.
*   Persists raw and processed data locally.

## Project Structure

*   `data/`: Storage for all data (raw, processed, match details, filtered data, aggregated stats).
*   `src/`: Contains the core Node.js scripts (`config.js`, `utils.js`, `stepX_*.js`).
*   `package.json`: Project dependencies and scripts.
*   `run_all.bat`/`run_all.sh`: Helper scripts to run processing steps sequentially.

## Setup

1.  **Prerequisites:** Ensure you have [Node.js](https://nodejs.org/) (includes npm) installed.
2.  **Clone Repository:** Clone this repository to your local machine.
3.  **Install Dependencies:** Navigate to the project directory in your terminal and run:
    ```bash
    npm install
    ```
4.  **Configuration:** Review `src/config.js` and adjust settings like API URLs, polling intervals, or data directories if necessary.

## Usage

The project workflow involves two main phases: continuously fetching live data and periodically processing that data through several steps.

1.  **Start Live Data Fetching (Continuous):**
    This script (`step1_fetch_live.js`) runs indefinitely, polling the OpenDota live API. It should be run in a separate terminal or managed by a process manager (e.g., `pm2`).
    ```bash
    npm run start:fetch
    # or: node src/step1_fetch_live.js
    ```

    There is also a step1.bat that works exacly the .js file, but you can run using `./step1.bat` or just opening the file inside windows.

2.  **Run Data Processing Steps (Periodically):**
    After `step1` has collected enough data, run the subsequent steps (`step2` through `step5`) to process it. These steps are designed to be run sequentially.

    *   **Recommended:** Use the provided npm script or shell/batch file to run steps 2-5 automatically.
        ```bash
        # Using npm script
        npm run run:all

        # Using shell/batch script (from project root)
        # ./run_all.sh  (Linux/macOS)
        # .\run_all.bat (Windows)
        ```

    *   **Alternatively:** Run each step individually.
        ```bash
        npm run step2 # Filters live data
        npm run step3 # Downloads match details
        npm run step4 # Extracts cosmetic data from matches
        npm run step5 # Aggregates daily statistics
        ```

## Workflow Overview

*   `step1`: Fetches raw live match data (`data/raw/`).
*   `step2`: Filters raw data for top matches, saves a list, and moves raw files (`data/processed/filtered_live_matches.json`, `data/raw/processed/`).
*   `step3`: Downloads detailed match data for filtered matches (`data/matches/`).
*   `step4`: Extracts cosmetic usage and relevant info from match details (`data/filtered_matches/`).
*   `step5`: Reads extracted data and updates the aggregated daily statistics database (`data/database/daily_cosmetic_stats.json`).

## Notes

*   Be mindful of OpenDota API rate limits. Default settings in `config.js` are conservative.
*   Step 3 includes a check (`minimumMatchAgeHours` in `config.js`) to ensure match details are likely available on the API.
*   Data from `raw`, `matches`, and `filtered_matches` directories is preserved for potential reprocessing or analysis.