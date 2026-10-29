@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo        TracelyTag Kubernetes Deployment Runner
echo ========================================================

:: 1. Verify cluster connection
echo [1/8] Verifying cluster connection...
kubectl cluster-info >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Cannot connect to Kubernetes cluster!
    echo Please ensure either:
    echo   1. Docker Desktop -^> Settings -^> Kubernetes -^> 'Enable Kubernetes' is checked.
    echo   2. Or your cloud cluster context is active in kubectl.
    exit /b 1
)

for /f "delims=" %%i in ('kubectl config current-context 2^>nul') do set "k8s_context=%%i"
echo   Active Cluster Context: !k8s_context!

:: 2. Determine Image Source (Local vs Docker Hub)
set DOCKER_USER=%~1
set IMAGE_TAG=%~2

if "%DOCKER_USER%"=="" (
    echo.
    echo Deployment Image Source:
    echo   [1] Use local Docker images (tracly-tag-final-backend:latest / tracly-tag-final-frontend:latest)
    echo   [2] Pull from Docker Hub registry (e.g. username/tracly-tag-final-backend:tag)
    set /p img_mode="Choose image source (1 or 2) [2]: "
    if "!img_mode!"=="" set img_mode=2
    if "!img_mode!"=="2" (
        set /p DOCKER_USER="Enter Docker Hub Username [luphonixprime]: "
        if "!DOCKER_USER!"=="" set DOCKER_USER=luphonixprime
        set /p IMAGE_TAG="Enter Image Tag [latest]: "
        if "!IMAGE_TAG!"=="" set IMAGE_TAG=latest
    )
)

if not "%DOCKER_USER%"=="" (
    if "%IMAGE_TAG%"=="" set IMAGE_TAG=latest
    set "BACKEND_IMAGE=%DOCKER_USER%/tracly-tag-final-backend:%IMAGE_TAG%"
    set "FRONTEND_IMAGE=%DOCKER_USER%/tracly-tag-final-frontend:%IMAGE_TAG%"
    echo   Target Backend Image:  !BACKEND_IMAGE!
    echo   Target Frontend Image: !FRONTEND_IMAGE!
) else (
    echo   Target Images: Local development images
)

:: 3. Apply Namespace and Configurations
echo.
echo [2/8] Applying namespace and configuration secrets...
kubectl apply -f k8s\00-namespace.yaml
kubectl apply -f k8s\01-configmap-secrets.yaml

:: 4. Deploy Infrastructure Services
echo [3/8] Deploying infrastructure dependencies (PostgreSQL, PgBouncer, Redis)...
kubectl apply -f k8s\01b-postgres.yaml
kubectl apply -f k8s\02-pgbouncer.yaml
kubectl apply -f k8s\03-redis.yaml
kubectl apply -f k8s\03b-mailpit.yaml

:: 5. Deploy Workloads
echo [4/8] Deploying Application Services (Backend API ^& Frontend Nginx)...
kubectl apply -f k8s\04-backend-deployment.yaml
kubectl apply -f k8s\05-frontend-deployment.yaml

:: Patch deployments if using remote Docker Hub images
if not "%DOCKER_USER%"=="" (
    echo   Updating deployment images to Docker Hub tags...
    kubectl set image deployment/tracelytag-backend backend=!BACKEND_IMAGE! -n tracelytag
    kubectl set image deployment/tracelytag-frontend frontend=!FRONTEND_IMAGE! -n tracelytag
)

:: 6. Deploy Ingress and Autoscaling
echo [5/8] Deploying Ingress and Horizontal Pod Autoscaler (HPA)...
kubectl apply -f k8s\06-ingress.yaml
kubectl apply -f k8s\07-hpa.yaml

:: 7. Deploy Scheduled Maintenance Jobs
echo [6/8] Deploying Recurring CronJobs and Maintenance Jobs...
kubectl apply -f k8s\08-cronjob-db-backup.yaml
kubectl apply -f k8s\09-job-db-verify.yaml

:: 8. Rollout Verification & Health Summary
echo.
echo [7/8] Verifying rollout status...
kubectl rollout status deployment/tracelytag-backend -n tracelytag --timeout=60s >nul 2>&1
kubectl rollout status deployment/tracelytag-frontend -n tracelytag --timeout=60s >nul 2>&1

echo.
echo [8/8] Deployment Summary:
echo --------------------------------------------------------
kubectl get pods -n tracelytag -o wide
echo.
kubectl get svc,ingress -n tracelytag
echo ========================================================
echo Kubernetes deployment applied successfully!
echo To monitor pods live: kubectl get pods -n tracelytag -w
echo ========================================================
pause
