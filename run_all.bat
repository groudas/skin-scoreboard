@echo off
echo Running Step 2: Filter Top Matches...
node src/step2_filter_top_matches.js
if %errorlevel% neq 0 (
    echo ERROR in Step 2
    exit /b %errorlevel%
)

echo Running Step 3: Fetch Match Details...
node src/step3_fetch_match_details.js
if %errorlevel% neq 0 (
    echo ERROR in Step 3
    exit /b %errorlevel%
)

echo Running Step 4: Extract Match Data...
node src/step4_extract_match_data.js
if %errorlevel% neq 0 (
    echo ERROR in Step 4
    exit /b %errorlevel%
)

echo Running Step 5: Update Database...
node src/step5_update_database.js
if %errorlevel% neq 0 (
    echo ERROR in Step 5
    exit /b %errorlevel%
)

echo All steps completed successfully.
exit /b 0