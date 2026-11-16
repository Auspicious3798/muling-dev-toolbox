@echo off
setlocal
cd /d E:\Codes\Projects\muling-dev-toolbox
if exist scripts\_bump.cjs del /q scripts\_bump.cjs
taskkill /F /IM electron.exe /T >nul 2>&1
if not exist _build mkdir _build
echo ==== build start %TIME% ==== > _build\build.log
call npm run electron:build >> _build\build.log 2>&1
echo BUILD_EXIT=%ERRORLEVEL% >> _build\build.log
endlocal
