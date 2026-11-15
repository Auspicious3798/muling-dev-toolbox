@echo off
cd /d E:\Codes\Projects\muling-dev-toolbox
set NODE_ENV=
set MULING_LITE_UI=1
call npx electron . > _dev\app.log 2>&1
echo APP_EXIT=%ERRORLEVEL% >> _dev\app.log
