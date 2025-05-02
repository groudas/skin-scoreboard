# Skin Scoreboard

This project tracks the popularity of Dota 2 cosmetics by analyzing live match data from the OpenDota API. It identifies highly-spectated matches, extracts cosmetic usage from those matches, and aggregates daily statistics on which cosmetics are seen in the most watched games.

**Experimental - Use with Caution**

This code is under active development and is currently **highly experimental**.

**Upcoming (v0.5 MVP):**
*   MongoDB full migration (speedy DB queries)
*   Usage indicators (better data comprehension)
*   Marketplace price analysis (actual usefulness for the data)

By using this software, you acknowledge it is provided at your **own risk**.

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
2.  **MongoDB:** This project uses MongoDB for data storage. Ensure you have MongoDB installed and a MongoDB server is running on `mongodb://127.0.0.1:27017`. You can download MongoDB from the official website ([https://www.mongodb.com/try/download/community](https://www.mongodb.com/try/download/community)). The data processing steps (step2 onwards) will require a running MongoDB instance.
3.  **Clone Repository:** Clone this repository to your local machine.
4.  **Install Dependencies:** Navigate to the project directory in your terminal and run:
    ```bash
    npm install
    ```
