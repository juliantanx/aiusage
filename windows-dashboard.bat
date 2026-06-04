@echo off
setlocal enabledelayedexpansion
title AI Usage Dashboard
chcp 65001 >nul 2>&1

set "PORT=3847"

:: Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo   [ERROR] Node.js is not installed.
    echo   Please install Node.js 20+ from https://nodejs.org
    echo.
    pause
    goto :end
)

:: Check aiusage
where aiusage >nul 2>&1
if errorlevel 1 (
    echo.
    echo   aiusage is not installed.
    echo.
    set "install_choice="
    set /p "install_choice=  Install now? [Y/N]: "
    if /i "!install_choice!"=="Y" (
        echo.
        echo   Installing aiusage...
        call npm install -g @juliantanx/aiusage
        if errorlevel 1 (
            echo.
            echo   Installation failed. Try running as Administrator.
            pause
            goto :end
        )
        echo.
        echo   Installed successfully!
    ) else (
        echo.
        echo   Run "npm install -g @juliantanx/aiusage" to install manually.
        pause
        goto :end
    )
)

:: Command-line mode
if "%~1"=="start" (
    call :do_start
    goto :end
)
if "%~1"=="stop" (
    call :do_stop
    goto :end
)
if "%~1"=="status" (
    call :check_running
    if !RUNNING!==1 (
        echo Dashboard is RUNNING on port !ACTUAL_PORT!
    ) else (
        echo Dashboard is STOPPED
    )
    goto :end
)

:menu
cls
echo.
echo   ========================================
echo     AI Usage Dashboard (aiusage)
echo   ========================================
echo.

call :check_running
if !RUNNING!==1 (
    echo   Status: RUNNING  http://localhost:!ACTUAL_PORT!
) else (
    echo   Status: STOPPED
)
echo.
echo   [1] Start Dashboard
echo   [2] Stop Dashboard
echo   [3] Restart Dashboard
echo   [4] Open in Browser
echo   [5] Check Update
echo   [6] Exit
echo.
set "choice="
set /p "choice=  Please select [1-6]: "

if "%choice%"=="1" goto menu_start
if "%choice%"=="2" goto menu_stop
if "%choice%"=="3" goto menu_restart
if "%choice%"=="4" goto menu_open
if "%choice%"=="5" goto menu_update
if "%choice%"=="6" goto end
echo.
echo   Invalid choice.
timeout /t 1 >nul
goto menu

:menu_start
call :do_start
echo.
pause
goto menu

:menu_stop
call :do_stop
echo.
pause
goto menu

:menu_restart
call :do_stop
echo   Waiting...
timeout /t 2 >nul
call :do_start
echo.
pause
goto menu

:menu_open
call :do_open
timeout /t 1 >nul
goto menu

:menu_update
call :do_update
echo.
pause
goto menu

:check_running
set "RUNNING=0"
set "ACTUAL_PORT=%PORT%"
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":%PORT% "') do (
    set "RUNNING=1"
)
if !RUNNING!==0 (
    set "PORT_FILE=%USERPROFILE%\.aiusage\.serve-port"
    if exist "!PORT_FILE!" (
        set /p ACTUAL_PORT=<"!PORT_FILE!"
        for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":!ACTUAL_PORT! "') do (
            set "RUNNING=1"
        )
    )
)
goto :eof

:do_start
call :check_running
if !RUNNING!==1 (
    echo.
    echo   Dashboard is already running on port !ACTUAL_PORT!.
    echo   Opening browser...
    start "" "http://localhost:!ACTUAL_PORT!"
    goto :eof
)
echo.
echo   Starting dashboard server...
start "AI Usage Dashboard Server" /min aiusage serve
echo   Waiting for server to be ready...
set "ATTEMPTS=0"
:wait_loop
timeout /t 1 >nul
set /a ATTEMPTS+=1
call :check_running
if !RUNNING!==1 (
    echo.
    echo   Dashboard started successfully!
    echo   URL: http://localhost:!ACTUAL_PORT!
    start "" "http://localhost:!ACTUAL_PORT!"
    goto :eof
)
if !ATTEMPTS! LSS 15 goto wait_loop
echo.
echo   Server may still be starting. Try http://localhost:%PORT% shortly.
goto :eof

:do_stop
call :check_running
if !RUNNING!==0 (
    echo.
    echo   Dashboard is not running.
    goto :eof
)
echo.
echo   Stopping dashboard...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":!ACTUAL_PORT! "') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 >nul
call :check_running
if !RUNNING!==0 (
    echo   Dashboard stopped.
) else (
    echo   Could not stop. Try closing the server window manually.
)
goto :eof

:do_open
call :check_running
if !RUNNING!==0 (
    echo.
    echo   Dashboard is not running. Please start it first.
    goto :eof
)
start "" "http://localhost:!ACTUAL_PORT!"
goto :eof

:do_update
echo.
echo   Checking for updates...

for /f "tokens=*" %%a in ('aiusage --version 2^>nul') do set "LOCAL_VER=%%a"
for /f "tokens=*" %%a in ('npm view @juliantanx/aiusage version 2^>nul') do set "REMOTE_VER=%%a"

if "!LOCAL_VER!"=="" (
    echo   Could not detect local version.
    goto :eof
)
if "!REMOTE_VER!"=="" (
    echo   Could not fetch remote version. Check your network.
    goto :eof
)

echo.
echo   Local version:  !LOCAL_VER!
echo   Latest version: !REMOTE_VER!

if "!LOCAL_VER!"=="!REMOTE_VER!" (
    echo.
    echo   Already up to date.
    goto :eof
)

echo.
set "update_choice="
set /p "update_choice=  Update to !REMOTE_VER!? [Y/N]: "

if /i "!update_choice!"=="Y" (
    echo.
    echo   Updating...
    call npm update -g @juliantanx/aiusage
    if errorlevel 1 (
        echo.
        echo   Update failed. Try running as Administrator.
        goto :eof
    )
    echo.
    for /f "tokens=*" %%a in ('aiusage --version 2^>nul') do set "NEW_VER=%%a"
    echo   Updated to !NEW_VER!. Restart the dashboard to apply.
) else (
    echo.
    echo   Update skipped.
)
goto :eof

:end
endlocal