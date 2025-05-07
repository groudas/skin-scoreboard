@echo off
setlocal enabledelayedexpansion

REM --- Configuration ---
SET "TARGET_URL=https://api.opendota.com/api/live"
SET "OUTPUT_DIR=..\..\data\raw"
SET "INTERVAL_SECONDS=900" REM 15 minutes * 60 seconds/minute
SET "FILE_EXT=.json"

REM --- Check if curl is available ---
where curl >nul 2>&1
IF !ERRORLEVEL! NEQ 0 (
    ECHO ERROR: 'curl' not found. Please ensure it is installed and available in your PATH.
    PAUSE
    EXIT /B 2
)

REM --- Check if jq is available (optional, for JSON validation) ---
where jq >nul 2>&1
IF !ERRORLEVEL! NEQ 0 (
    ECHO WARNING: 'jq' not found. JSON validation will not be performed.
) ELSE (
    SET "USE_JQ=1"
)

REM --- Check/Create Output Directory ---
IF NOT EXIST "%OUTPUT_DIR%" (
    ECHO Directory "%OUTPUT_DIR%" not found.
    ECHO Attempting to create it...
    MKDIR "%OUTPUT_DIR%" 2>nul
    IF !ERRORLEVEL! NEQ 0 (
        ECHO ERROR: Failed to create directory "%OUTPUT_DIR%". Please create it manually.
        PAUSE
        EXIT /B 1
    ) ELSE (
        ECHO Directory created successfully.
    )
)

:mainloop
REM --- Generate Timestamp for Filename (YYYYMMDD_HHMMSS format) ---
FOR /F "tokens=2 delims==" %%A IN ('wmic os get LocalDateTime /value') DO SET "DATETIME_WMIC=%%A"
SET "TIMESTAMP=%DATETIME_WMIC:~0,8%_%DATETIME_WMIC:~8,6%"
SET "OUTPUT_FILENAME=%OUTPUT_DIR%\live_data_%TIMESTAMP%%FILE_EXT%"

REM --- Get Current Time for Logging ---
FOR /F "tokens=2 delims==" %%T IN ('wmic os get LocalDateTime /value') DO SET "LOGTIME=%%T"
SET "LOGTIME_FORMATTED=%LOGTIME:~0,4%-%LOGTIME:~4,2%-%LOGTIME:~6,2% %LOGTIME:~8,2%:%LOGTIME:~10,2%:%LOGTIME:~12,2%"

ECHO [%LOGTIME_FORMATTED%] Fetching data from %TARGET_URL%
ECHO [%LOGTIME_FORMATTED%] Saving to: %OUTPUT_FILENAME%

REM --- Execute the HTTP Request using curl ---
curl -s --fail -o "%OUTPUT_FILENAME%" "%TARGET_URL%"

REM --- Check if curl was successful ---
IF !ERRORLEVEL! NEQ 0 (
    ECHO [%LOGTIME_FORMATTED%] ERROR: curl command failed. Check URL or network connection.
    IF EXIST "%OUTPUT_FILENAME%" DEL "%OUTPUT_FILENAME%" > nul 2>&1
) ELSE (
    FOR %%F IN ("%OUTPUT_FILENAME%") DO (
        IF %%~zF EQU 0 (
            ECHO [%LOGTIME_FORMATTED%] WARNING: Saved file is empty. The server might have returned an empty response.
        ) ELSE (
            IF DEFINED USE_JQ (
                REM --- Validate JSON using jq ---
                jq . "%OUTPUT_FILENAME%" >nul 2>&1
                IF !ERRORLEVEL! NEQ 0 (
                    ECHO [%LOGTIME_FORMATTED%] WARNING: Saved file is not a valid JSON.
                    IF EXIST "%OUTPUT_FILENAME%" DEL "%OUTPUT_FILENAME%" > nul 2>&1
                ) ELSE (
                    ECHO [%LOGTIME_FORMATTED%] Success. Data saved as valid JSON.
                )
            ) ELSE (
                ECHO [%LOGTIME_FORMATTED%] Success. Data saved.
            )
        )
    )
)

ECHO [%LOGTIME_FORMATTED%] Waiting for %INTERVAL_SECONDS% seconds...
ECHO --------------------------------------------------
timeout /t %INTERVAL_SECONDS% /nobreak > nul

GOTO mainloop

endlocal