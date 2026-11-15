@echo off
cd /d E:\Codes\Projects\muling-dev-toolbox
call npx vite build > _dev\vite.log 2>&1
echo VITE_EXIT=%ERRORLEVEL% >> _dev\vite.log
