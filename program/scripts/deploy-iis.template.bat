@echo off
setlocal EnableExtensions
rem ======================================================================
rem  Logistics Tool {{VERSION}} - one-click IIS deploy (static single HTML file)
rem  Generated for this release by program/scripts/deploy-script.mjs from deploy-iis.template.bat. Do not edit by hand.
rem
rem  One download: {{ZIPNAME}} holds the HTML and this script. Save it in
rem  %USERPROFILE%\Downloads on the IIS server (Windows Server 2016+), open it
rem  and double-click {{SCRIPT}}; it asks for Administrator rights itself.
rem
rem  Usage:   {{SCRIPT}} [PORT] [TARGET_DIR]
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

set "ZIPNAME={{ZIPNAME}}"
set "EXPECT_SHA256={{SHA256}}"
set "INETSRV=%windir%\system32\inetsrv"
set "APPCMD=%INETSRV%\appcmd.exe"
set "TMPX=%TEMP%\logistics-{{version}}-extract"
set "BACKUP=%TARGET%_backup"

echo.
echo === Logistics Tool {{VERSION}} : IIS deploy ===
echo Site: %SITE%   Port: %PORT%
echo Dir : %TARGET%
echo.

rem ---- [1/6] pre-checks -------------------------------------------------
rem The deploy always continues in a window that stays open (cmd /k), so every message can be read, also when this
rem script was started as Administrator. Explorer deletes files opened from inside a zip once this window exits, so
rem the new window runs a stable copy in Downloads, next to the {{VERSION}} zip that holds this script.
if /i "%~3"=="ELEVATED" goto :inwindow
set "SELF=%USERPROFILE%\Downloads\{{SCRIPT}}"
if /i not "%~f0"=="%SELF%" copy /y "%~f0" "%SELF%" >nul
if not exist "%SELF%" set "SELF=%~f0"
fltmc >nul 2>&1
if errorlevel 1 goto :elevate
start "Logistics Tool {{VERSION}} : IIS deploy" cmd.exe /k call "%SELF%" %PORT% "%TARGET%" ELEVATED
exit /b 0
:elevate
echo Not elevated - asking Windows for Administrator rights ^(click Yes on the UAC prompt^)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Start-Process -FilePath cmd.exe -Verb RunAs -ErrorAction Stop -ArgumentList ('/k call \"' + $env:SELF + '\" ' + $env:PORT + ' \"' + $env:TARGET + '\" ELEVATED') } catch { Write-Host ('[X] ' + $_.Exception.Message); exit 1 }"
if not errorlevel 1 exit /b 0
echo [X] Windows did not open the Administrator window ^(UAC cancelled or blocked^).
echo     Right-click {{SCRIPT}} and choose "Run as administrator", or ask the server owner.
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

rem The script ships inside {{ZIPNAME}} (one download). Double-clicked there, it runs from a temporary folder; the copy
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
  echo     in %USERPROFILE%\Downloads, open it and double-click {{SCRIPT}} inside it.
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
  echo [X] SHA-256 mismatch - the HTML in the zip named at [1/6] is not the expected {{VERSION}} build ^({{ZIPNAME}}^).
  echo     Delete that zip, save {{ZIPNAME}} from the GitHub release in Downloads again, open it and double-click {{SCRIPT}} inside it. Stopping.
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

rem ---- Upload to server (V18) --------------------------------------------
rem The tool's "Upload to server" button sends logistics-data.json with an HTTP PUT, and first the file it replaces as
rem logistics-data.previous.json. Owner decision 2026-10-23: every signed-in company Windows account may upload, only
rem these two files; everyone keeps reading without signing in. The limits are set first and writing is switched on
rem last, only when every limit is in place; if any limit cannot be set, writing is switched off and the deploy goes on.
rem WebDAV Publishing is a server-wide IIS feature: added to the whole server it would answer PUT and DELETE of the other
rem sites on this server with 405 (V18 review). When it was not on before, it is taken out of the server-wide lists
rem again and added to this site only; if that cannot be done, the feature is removed again and upload stays off.
rem DISM is called with "call" so that deploy:sim can stand in for it.
set "DISM=%SystemRoot%\System32\dism.exe"
set "FINDSTR=%SystemRoot%\System32\findstr.exe"
set "ICACLS=%SystemRoot%\System32\icacls.exe"
set "PSH=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
set "UPLOADSTEP="
set "WEBDAV_WAS_ON=0"
for /f "delims=" %%S in ('call "%DISM%" /online /English /get-featureinfo /featurename:IIS-WebDAV 2^>nul ^| "%FINDSTR%" /c:"State : Enabled"') do set "WEBDAV_WAS_ON=1"
echo       Turning on Upload to server ^(IIS features; the first time this can take a few minutes^)...
call "%DISM%" /online /enable-feature /featurename:IIS-WebDAV /featurename:IIS-WindowsAuthentication /featurename:IIS-URLAuthorization /all /norestart /quiet >nul 2>&1
set "DISMRC=%errorlevel%"
if not "%DISMRC%"=="0" if not "%DISMRC%"=="3010" (
  set "UPLOADSTEP=the IIS features WebDAV Publishing, Windows Authentication and URL Authorization could not be added"
  goto :uploadoff
)
if "%WEBDAV_WAS_ON%"=="1" goto :webdavscoped
"%APPCMD%" set config /section:system.webServer/handlers /-"[name='WebDAV']" /commit:apphost >nul 2>&1
if errorlevel 1 goto :webdavglobal
"%APPCMD%" set config /section:system.webServer/modules /-"[name='WebDAVModule']" /commit:apphost >nul 2>&1
if errorlevel 1 goto :webdavglobal
"%APPCMD%" set config "%SITE%" /section:system.webServer/modules /+"[name='WebDAVModule']" /commit:apphost >nul 2>&1
if errorlevel 1 (
  set "UPLOADSTEP=WebDAV could not be added to this site"
  goto :uploadoff
)
"%APPCMD%" set config "%SITE%" /section:system.webServer/handlers /+"[@start,name='WebDAV',path='*',verb='PROPFIND,PROPPATCH,MKCOL,PUT,COPY,DELETE,MOVE,LOCK,UNLOCK',modules='WebDAVModule',resourceType='Unspecified',requireAccess='None']" /commit:apphost >nul 2>&1
if errorlevel 1 (
  set "UPLOADSTEP=WebDAV could not be added to this site"
  goto :uploadoff
)
goto :webdavscoped
:webdavglobal
call "%DISM%" /online /disable-feature /featurename:IIS-WebDAV /norestart /quiet >nul 2>&1
set "UPLOADSTEP=WebDAV could not be limited to this site, so it was removed again"
goto :uploadoff
:webdavscoped
"%APPCMD%" set config "%SITE%" /section:system.webServer/security/authentication/windowsAuthentication /enabled:true /commit:apphost >nul 2>&1
if errorlevel 1 (
  set "UPLOADSTEP=Windows sign-in could not be turned on"
  goto :uploadoff
)
"%APPCMD%" set config "%SITE%" /section:system.webServer/security/authorization /-"[accessType='Deny',users='?',verbs='PUT,DELETE,MKCOL,COPY,MOVE,PROPPATCH,LOCK,UNLOCK']" /commit:apphost >nul 2>&1
"%APPCMD%" set config "%SITE%" /section:system.webServer/security/authorization /+"[accessType='Deny',users='?',verbs='PUT,DELETE,MKCOL,COPY,MOVE,PROPPATCH,LOCK,UNLOCK']" /commit:apphost >nul 2>&1
if errorlevel 1 (
  set "UPLOADSTEP=writing could not be limited to signed-in users"
  goto :uploadoff
)
"%APPCMD%" set config "%SITE%" /section:system.webServer/webdav/authoringRules /-"[users='*',path='logistics-data.json']" /commit:apphost >nul 2>&1
"%APPCMD%" set config "%SITE%" /section:system.webServer/webdav/authoringRules /+"[users='*',path='logistics-data.json',access='Read, Write']" /commit:apphost >nul 2>&1
if errorlevel 1 (
  set "UPLOADSTEP=writing could not be limited to the two data files"
  goto :uploadoff
)
"%APPCMD%" set config "%SITE%" /section:system.webServer/webdav/authoringRules /-"[users='*',path='logistics-data.previous.json']" /commit:apphost >nul 2>&1
"%APPCMD%" set config "%SITE%" /section:system.webServer/webdav/authoringRules /+"[users='*',path='logistics-data.previous.json',access='Read, Write']" /commit:apphost >nul 2>&1
if errorlevel 1 (
  set "UPLOADSTEP=writing could not be limited to the two data files"
  goto :uploadoff
)
"%ICACLS%" "%TARGET%" /grant "*S-1-5-11:(OI)(CI)M" >nul 2>&1
if errorlevel 1 (
  set "UPLOADSTEP=signed-in users could not be allowed to change the files in %TARGET%"
  goto :uploadoff
)
"%APPCMD%" set config "%SITE%" /section:system.webServer/webdav/authoring /enabled:true /commit:apphost >nul 2>&1
if errorlevel 1 (
  set "UPLOADSTEP=WebDAV writing could not be switched on"
  goto :uploadoff
)
set "INDOMAIN="
for /f %%D in ('call "%PSH%" -NoProfile -Command "(Get-CimInstance Win32_ComputerSystem).PartOfDomain"') do set "INDOMAIN=%%D"
echo       Upload to server: on ^(any signed-in company Windows account may replace logistics-data.json^)
if "%WEBDAV_WAS_ON%"=="0" echo       WebDAV is on for site %SITE% only; other IIS sites on this server are not changed.
if /i not "%INDOMAIN%"=="True" echo [!] This server is not in a company domain: only Windows accounts of this server can sign in to upload.
if "%DISMRC%"=="3010" echo [!] Windows wants a restart to finish the IIS features. Restart the server when convenient; until then the upload may not work.
echo       To stop uploads later: %INETSRV%\appcmd.exe set config "%SITE%" /section:system.webServer/webdav/authoring /enabled:false /commit:apphost
goto :uploaddone
:uploadoff
"%APPCMD%" set config "%SITE%" /section:system.webServer/webdav/authoring /enabled:false /commit:apphost >nul 2>&1
echo [!] Upload to server was NOT turned on: %UPLOADSTEP%. Nobody can upload; the tool works as before.
echo     Download file for the server still works. The server owner can fix this and run this script again.
:uploaddone

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
