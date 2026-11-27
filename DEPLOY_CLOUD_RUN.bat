@echo off
title DhuanTrace - deploy to Google Cloud Run
cd /d "%~dp0"
setlocal EnableDelayedExpansion
echo.
echo This puts DhuanTrace on Google Cloud Run and gives you a public https link for the hackathon.
echo It also creates a Cloud Storage bucket (so saved data survives restarts) and a Cloud Scheduler job
echo (so the forecast ledger is written every hour even when nobody has the page open).
echo You need the Google Cloud SDK installed and a project with billing turned on (free credits are fine).
echo.
where gcloud >nul 2>&1
if errorlevel 1 (
  echo Google Cloud SDK is not installed. Opening the download page...
  start "" https://cloud.google.com/sdk/docs/install
  pause
  exit /b
)
if not exist .env (
  echo .env not found. Copy .env.example to .env and add your keys first.
  pause
  exit /b
)
rem Read KEY=value lines from .env, skipping comments and empty values
set "VARS="
for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do (
  if not "%%b"=="" (
    if defined VARS (set "VARS=!VARS!,%%a=%%b") else (set "VARS=%%a=%%b")
  )
)
echo Keys found in .env will be sent to Cloud Run as environment variables.
echo.
call gcloud auth list --filter=status:ACTIVE --format="value(account)"
echo If no account is shown above, a browser window opens so you can sign in.
call gcloud auth print-access-token >nul 2>&1 || call gcloud auth login
echo.
set /p PROJECT=Google Cloud project ID (from console.cloud.google.com): 
if "%PROJECT%"=="" (echo No project ID given. & pause & exit /b)
call gcloud config set project %PROJECT%
set "REGION=asia-south1"
set "BUCKET=%PROJECT%-dhuantrace-data"
echo.
echo [1/5] Turning on the Google Cloud services DhuanTrace uses...
call gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com storage.googleapis.com cloudscheduler.googleapis.com
echo.
echo [2/5] Cloud Storage bucket gs://%BUCKET% for saved data...
call gcloud storage buckets describe gs://%BUCKET% >nul 2>&1 || call gcloud storage buckets create gs://%BUCKET% --location=%REGION% --uniform-bucket-level-access
for /f "usebackq delims=" %%n in (`gcloud projects describe %PROJECT% --format^="value(projectNumber)"`) do set "PROJNUM=%%n"
call gcloud storage buckets add-iam-policy-binding gs://%BUCKET% --member=serviceAccount:!PROJNUM!-compute@developer.gserviceaccount.com --role=roles/storage.objectAdmin >nul
rem A long random token that only Cloud Scheduler knows, for the hourly jobs endpoint
for /f "usebackq delims=" %%g in (`powershell -NoProfile -Command "[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')"`) do set "JOB_TOKEN=%%g"
set "EXTRA=GCS_BUCKET=%BUCKET%,JOB_TOKEN=!JOB_TOKEN!"
if defined VARS (set "ALLVARS=!VARS!,!EXTRA!") else (set "ALLVARS=!EXTRA!")
echo.
echo [3/5] Deploying... this takes 3 to 6 minutes the first time. Answer Y if asked.
call gcloud run deploy dhuantrace --source . --region %REGION% --allow-unauthenticated --max-instances 1 --memory 512Mi --set-env-vars "!ALLVARS!"
if errorlevel 1 (echo Deploy failed. Read the message above. & pause & exit /b)
for /f "usebackq delims=" %%u in (`gcloud run services describe dhuantrace --region %REGION% --format^="value(status.url)"`) do set "URL=%%u"
echo.
echo [4/5] Cloud Scheduler: run the hourly jobs at 5 minutes past every hour...
call gcloud scheduler jobs delete dhuantrace-hourly --location=%REGION% --quiet >nul 2>&1
call gcloud scheduler jobs create http dhuantrace-hourly --location=%REGION% --schedule="5 * * * *" --time-zone="Asia/Kolkata" --uri="!URL!/api/jobs/hourly" --http-method=POST --headers="x-job-token=!JOB_TOKEN!"
echo.
echo [5/5] Done.
echo Your public link:  !URL!
echo Put this link in the hackathon submission. Check !URL!/api/system to see every part working.
pause
