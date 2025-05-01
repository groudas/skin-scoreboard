# Dota 2 Cosmetic Popularity Tracker

This project fetches live Dota 2 match data, identifies top matches by spectators, downloads match details, extracts cosmetic usage, and aggregates a daily "popularity score" for each cosmetic based on spectator counts.

## Project Structure

-   `data/`: Stores all downloaded and processed data.
    -   `raw/`: Raw JSON data from the OpenDota live API.
    -   `processed/`: Filtered list of top matches per timestamp.
    -   `matches/`: Detailed JSON data for individual matches.
    -   `filtered_matches/`: Extracted cosmetic data per match.
    -   `database/`: Final aggregated daily cosmetic statistics.
-   `src/`: Contains the Node.js scripts for each step.
    -   `config.js`: Central configuration file.
    -   `utils.js`: Helper functions (logging, file system, etc.).
    -   `stepX_*.js`: Scripts for each processing stage.
-   `package.json`: Project dependencies and scripts.
-   `run_all.bat`/`run_all.sh`: Optional scripts to run steps 2-5 sequentially.

## Setup

1.  Ensure [Node.js](https://nodejs.org/) (which includes npm) is installed.
2.  Clone this repository or download the source code.
3.  Navigate to the project directory in your terminal.
4.  Install dependencies:
    ```bash
    npm install
    ```
5.  Review and adjust settings in `src/config.js` if needed (e.g., API URLs, intervals, directories).

## Execution

The process involves multiple steps:

1.  **Fetch Live Data (Continuous):**
    This script runs indefinitely, fetching live match data periodically. Start it in a separate terminal or using a process manager (like `pm2`).
    ```bash
    npm run start:fetch
    # or: node src/step1_fetch_live.js
    ```

2.  **Process Data (Run Periodically):**
    Run steps 2 through 5 sequentially after enough raw data has been collected. You can run them individually or use the provided helper scripts.
    ```bash
    # Option 1: Run all steps 2-5 using npm script
    npm run run:all

    # Option 2: Run using batch/shell script
    # ./run_all.sh  (Linux/macOS)
    # .\run_all.bat (Windows)

    # Option 3: Run steps individually
    # npm run step2
    # npm run step3
    # npm run step4
    # npm run step5
    ```

**Workflow:**

-   `step1` downloads raw live data -> `data/raw/`
-   `step2` reads raw data, filters top matches, saves -> `data/processed/filtered_live_matches.json`, renames raw files.
-   `step3` reads filtered matches, downloads details (if old enough and not present) -> `data/matches/`
-   `step4` reads match details, extracts cosmetics/date/spectators, saves -> `data/filtered_matches/`
-   `step5` reads extracted data, updates/aggregates daily stats -> `data/database/daily_cosmetic_stats.json`

**Important Notes:**

-   Be mindful of the OpenDota API rate limits. The default delays in `config.js` are conservative.
-   Step 3 includes a `minimumMatchAgeHours` check because replays might take time to become available on the API.
-   Data preservation is handled by keeping files in `raw`, `matches`, and `filtered_matches`. The final database aggregates the information.
-   Step 5 includes logic to update entries if a match is reprocessed with a higher spectator count.