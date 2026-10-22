@echo off
setlocal EnableExtensions
rem ======================================================================
rem  Logistics Tool V13.2 - one-click IIS deploy (static single HTML file)
rem  Generated for this release by program/scripts/deploy-script.mjs from deploy-iis.template.bat. Do not edit by hand.
rem
rem  One download: logistics-offline-20261022-v13.2.zip holds the HTML and this script. Save it in
rem  %USERPROFILE%\Downloads on the IIS server (Windows Server 2016+), open it
rem  and double-click deploy-iis.bat; it asks for Administrator rights itself.
rem
rem  Usage:   deploy-iis.bat [PORT] [TARGET_DIR]
rem  Default: PORT=8083  TARGET_DIR=D:\logistics-tool
rem
rem  What it does (and nothing else):
rem    1. checks admin rights, IIS, the zip, and that the port is free
rem    2. extracts the zip, verifies the HTML SHA-256, copies it to
rem       TARGET_DIR\index.html (old index.html is backed up first)
rem    3. grants read access to IIS_IUSRS and IUSR (by SID, works on a DC)
rem    4. creates its own app pool + site "LogisticsTool" (other sites untouched)
rem    5. requests http://localhost:PORT/ and prints the result
rem  It does NOT touch the Windows firewall or any other IIS site.
rem ======================================================================

set "SITE=LogisticsTool"
set "PORT=8083"
set "TARGET=D:\logistics-tool"
if not "%~1"=="" set "PORT=%~1"
if not "%~2"=="" set "TARGET=%~2"

set "ZIPNAME=logistics-offline-20261022-v13.2.zip"
set "EXPECT_SHA256=da6e9fc684a326d3cfe5e3d954cba3c9273a4132e93691e468b0c6a6f60f180b"
set "INETSRV=%windir%\system32\inetsrv"
set "APPCMD=%INETSRV%\appcmd.exe"
set "TMPX=%TEMP%\logistics-v13.2-extract"
set "BACKUP=%TARGET%_backup"

echo.
echo === Logistics Tool V13.2 : IIS deploy ===
echo Site: %SITE%   Port: %PORT%
echo Dir : %TARGET%
echo.

rem ---- [1/6] pre-checks -------------------------------------------------
rem The deploy always continues in a window that stays open (cmd /k), so every message can be read, also when this
rem script was started as Administrator. Explorer deletes files opened from inside a zip once this window exits, so
rem the new window runs a stable copy in Downloads, next to the V13.2 zip that holds this script.
if /i "%~3"=="ELEVATED" goto :inwindow
set "SELF=%USERPROFILE%\Downloads\deploy-iis.bat"
if /i not "%~f0"=="%SELF%" copy /y "%~f0" "%SELF%" >nul
if not exist "%SELF%" set "SELF=%~f0"
fltmc >nul 2>&1
if errorlevel 1 goto :elevate
start "Logistics Tool V13.2 : IIS deploy" cmd.exe /k call "%SELF%" %PORT% "%TARGET%" ELEVATED
exit /b 0
:elevate
echo Not elevated - asking Windows for Administrator rights ^(click Yes on the UAC prompt^)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Start-Process -FilePath cmd.exe -Verb RunAs -ErrorAction Stop -ArgumentList ('/k call \"' + $env:SELF + '\" ' + $env:PORT + ' \"' + $env:TARGET + '\" ELEVATED') } catch { Write-Host ('[X] ' + $_.Exception.Message); exit 1 }"
if not errorlevel 1 exit /b 0
echo [X] Windows did not open the Administrator window ^(UAC cancelled or blocked^).
echo     Right-click deploy-iis.bat and choose "Run as administrator", or ask the server owner.
echo Press any key to close this window...
pause >nul
exit /b 1
:inwindow
fltmc >nul 2>&1
if not errorlevel 1 goto :isadmin
echo [X] Still not Administrator after the UAC prompt. Ask the server owner to run it, or use IIS Manager manually.
goto :fail
:isadmin
if not exist "%INETSRV%\appcmd.exe" (
  echo [X] IIS not found: %INETSRV%\appcmd.exe
  goto :fail
)
pushd "%INETSRV%"

rem The script ships inside logistics-offline-20261022-v13.2.zip (one download). Double-clicked there, it runs from a temporary folder; the copy
rem in Downloads that runs here finds the zip next to it.
set "ZIP="
if exist "%~dp0%ZIPNAME%" set "ZIP=%~dp0%ZIPNAME%"
if not defined ZIP if exist "%USERPROFILE%\Downloads\%ZIPNAME%" set "ZIP=%USERPROFILE%\Downloads\%ZIPNAME%"
rem A browser saves a second download as "name (1).zip": take the newest copy of this release. The SHA-256 check
rem below still stops any other build.
set "ZIPBASE=%ZIPNAME:.zip=%"
if not defined ZIP for /f "delims=" %%Z in ('dir /b /a-d /o-d "%USERPROFILE%\Downloads\%ZIPBASE%*.zip" 2^>nul') do if not defined ZIP set "ZIP=%USERPROFILE%\Downloads\%%Z"
if not defined ZIP (
  echo [X] %ZIPNAME% not found next to this script or in Downloads.
  echo     This script deploys the HTML inside that zip. Save %ZIPNAME% from the GitHub release
  echo     in %USERPROFILE%\Downloads, open it and double-click deploy-iis.bat inside it.
  echo     Release zips now in Downloads:
  dir /b /a-d "%USERPROFILE%\Downloads\logistics-offline-*.zip" 2>nul || echo       ^(none^)
  goto :fail
)
echo [1/6] OK  zip: %ZIP%

set "SITE_EXISTS=0"
"%APPCMD%" list site /name:"%SITE%" >nul 2>&1
if not errorlevel 1 set "SITE_EXISTS=1"

if "%SITE_EXISTS%"=="0" (
  netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul
  if not errorlevel 1 (
    echo [X] Port %PORT% is already listening. Pick another port: %~nx0 8084
    goto :fail
  )
  "%APPCMD%" list site | findstr /C:":%PORT%:" >nul
  if not errorlevel 1 (
    echo [X] Port %PORT% is already bound by another IIS site ^(maybe a stopped one^). Pick another port.
    goto :fail
  )
  echo [1/6] OK  port %PORT% is free
) else (
  echo [1/6] OK  site %SITE% already exists - redeploy mode ^(files only^)
)

rem ---- [2/6] extract + verify ------------------------------------------
if exist "%TMPX%" rmdir /s /q "%TMPX%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath $env:ZIP -DestinationPath $env:TMPX -Force"
if errorlevel 1 (
  echo [X] Extract failed.
  goto :fail
)
set "SRC="
for %%F in ("%TMPX%\*.html") do set "SRC=%%~fF"
if not defined SRC (
  echo [X] No .html found inside the zip.
  goto :fail
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "if ((Get-FileHash -Algorithm SHA256 -LiteralPath $env:SRC).Hash -ne $env:EXPECT_SHA256) { exit 1 }"
if errorlevel 1 (
  echo [X] SHA-256 mismatch - the HTML in the zip named at [1/6] is not the expected V13.2 build ^(logistics-offline-20261022-v13.2.zip^).
  echo     Delete that zip, save logistics-offline-20261022-v13.2.zip from the GitHub release in Downloads again, open it and double-click deploy-iis.bat inside it. Stopping.
  goto :fail
)
echo [2/6] OK  extracted and SHA-256 verified

rem ---- [3/6] copy files (with backup) ----------------------------------
if not exist "%TARGET%" mkdir "%TARGET%"
if not exist "%TARGET%" (
  echo [X] Cannot create %TARGET%
  goto :fail
)
if not exist "%TARGET%\index.html" goto :nobackup
if not exist "%BACKUP%" mkdir "%BACKUP%"
for /f %%T in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "TS=%%T"
copy /y "%TARGET%\index.html" "%BACKUP%\index.html.%TS%" >nul
echo       old index.html backed up to %BACKUP%\index.html.%TS%
:nobackup
copy /y "%SRC%" "%TARGET%\index.html" >nul
if errorlevel 1 (
  echo [X] Copy to %TARGET%\index.html failed.
  goto :fail
)
rem Every release of one date has the same file time inside its zip, and IIS answers a browser's "changed since?"
rem check from that time: give index.html the deploy time, so a later deploy on the same day is never served from cache.
powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-Item -LiteralPath ($env:TARGET + '\index.html')).LastWriteTime = Get-Date"
if errorlevel 1 echo [!] Could not set the time of index.html; if a browser shows the previous version, press Ctrl+F5.
echo [3/6] OK  index.html written

rem ---- [4/6] permissions (SIDs: IIS_IUSRS=S-1-5-32-568, IUSR=S-1-5-17) --
icacls "%TARGET%" /grant "*S-1-5-32-568:(OI)(CI)RX" >nul
icacls "%TARGET%" /grant "*S-1-5-17:(OI)(CI)RX" >nul
echo [4/6] OK  read permission granted to IIS_IUSRS and IUSR

rem ---- [5/6] IIS app pool + site ---------------------------------------
if "%SITE_EXISTS%"=="0" (
  "%APPCMD%" list apppool /name:"%SITE%" >nul 2>&1
  if errorlevel 1 "%APPCMD%" add apppool /name:"%SITE%" /managedRuntimeVersion:"" >nul
  "%APPCMD%" add site /name:"%SITE%" /bindings:http/*:%PORT%: /physicalPath:"%TARGET%"
  if errorlevel 1 (
    echo [X] appcmd add site failed. Nothing else was changed.
    goto :fail
  )
  "%APPCMD%" set app "%SITE%/" /applicationPool:"%SITE%" >nul
)
"%APPCMD%" start site /name:"%SITE%" >nul 2>&1
echo [5/6] OK  IIS site %SITE% is configured

rem ---- [6/6] smoke test --------------------------------------------------
set "PORT_FOR_TEST=%PORT%"
if "%SITE_EXISTS%"=="1" (
  for /f "tokens=2 delims=:" %%P in ('call "%APPCMD%" list site /name:"%SITE%" /text:bindings 2^>nul') do set "PORT_FOR_TEST=%%P"
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri ('http://localhost:' + $env:PORT_FOR_TEST + '/') -TimeoutSec 20; Write-Host ('       HTTP ' + $r.StatusCode + ', ' + $r.RawContentLength + ' bytes') } catch { Write-Host ('       FAILED: ' + $_.Exception.Message); exit 1 }"
if errorlevel 1 (
  echo [!] Deployed, but the local test failed. Check: IIS Manager ^> %SITE% ^> Browse, and the HTTP code above ^(403 = permissions, 404 = default document^).
  goto :fail
)
echo [6/6] OK  http://localhost:%PORT_FOR_TEST%/ responds

echo.
echo === DONE ===
echo From another machine:  http://%COMPUTERNAME%:%PORT_FOR_TEST%/   ^(or this server's IP^)
echo If it cannot be reached from other machines, the firewall needs an inbound rule.
echo This script did not change it. After the server owner approves, run:
echo   netsh advfirewall firewall add rule name="LogisticsTool %PORT_FOR_TEST%" dir=in action=allow protocol=TCP localport=%PORT_FOR_TEST%
echo Rollback: restore the file in %BACKUP%, or remove the site:
echo   %INETSRV%\appcmd.exe delete site "%SITE%"
echo.
if exist "%TMPX%" rmdir /s /q "%TMPX%"
popd 2>nul
echo Press any key to close this window...
pause >nul
endlocal
exit /b 0

:fail
echo.
echo *** Stopped. See the message above. ***
if exist "%TMPX%" rmdir /s /q "%TMPX%"
popd 2>nul
echo Press any key to close this window...
pause >nul
endlocal
exit /b 1
