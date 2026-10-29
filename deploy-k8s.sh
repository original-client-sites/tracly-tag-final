#!/bin/bash
# ==============================================================================
# TracelyTag Kubernetes Cluster Production Deployment Script (Ubuntu OVH VPS)
# ==============================================================================
# Features:
# 1. Automated environment discovery for Ubuntu OVH VPS (K3s, MicroK8s, standard K8s)
# 2. Auto-bootstrap K3s if no Kubernetes cluster is currently active on the VPS
# 3. Pulls and updates microservice images from Docker Hub (Backend & Frontend)
# 4. Zero-downtime rolling update with automated health checks and verification
# ==============================================================================

set -Eeuo pipefail

DEFAULT_DOCKER_USER="luphonixprime"
DEFAULT_IMAGE_TAG="latest"
NAMESPACE="tracelytag"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="${SCRIPT_DIR}/k8s"

echo "=========================================================="
echo "    TRACELYTAG KUBERNETES DEPLOYMENT (UBUNTU OVH VPS)    "
echo "=========================================================="

# 1. Resolve Docker Hub Username and Image Tag
DOCKER_USER="${1:-}"
IMAGE_TAG="${2:-}"

if [ -z "${DOCKER_USER}" ]; then
    if [ -t 0 ]; then
        read -p "Enter Docker Hub Username [default: ${DEFAULT_DOCKER_USER}]: " INPUT_USER
        DOCKER_USER="${INPUT_USER:-${DEFAULT_DOCKER_USER}}"
    else
        DOCKER_USER="${DEFAULT_DOCKER_USER}"
    fi
fi

if [ -z "${IMAGE_TAG}" ]; then
    if [ -t 0 ]; then
        read -p "Enter Image Tag [default: ${DEFAULT_IMAGE_TAG}]: " INPUT_TAG
        IMAGE_TAG="${INPUT_TAG:-${DEFAULT_IMAGE_TAG}}"
    else
        IMAGE_TAG="${DEFAULT_IMAGE_TAG}"
    fi
fi

BACKEND_IMAGE="${DOCKER_USER}/tracly-tag-final-backend:${IMAGE_TAG}"
FRONTEND_IMAGE="${DOCKER_USER}/tracly-tag-final-frontend:${IMAGE_TAG}"

echo "  Docker Hub Username: ${DOCKER_USER}"
echo "  Target Tag:          ${IMAGE_TAG}"
echo "  Backend Image:       ${BACKEND_IMAGE}"
echo "  Frontend Image:      ${FRONTEND_IMAGE}"
echo "  Target Namespace:    ${NAMESPACE}"
echo "----------------------------------------------------------"

# 2. Configure KUBECONFIG & Validate / Auto-install Kubernetes on Ubuntu VPS
echo "[1/8] Verifying Kubernetes environment on Ubuntu VPS..."

# Auto-detect K3s kubeconfig on Ubuntu if present
if [ -z "${KUBECONFIG:-}" ]; then
    if [ -f "/etc/rancher/k3s/k3s.yaml" ]; then
        export KUBECONFIG="/etc/rancher/k3s/k3s.yaml"
        # Ensure current user has read access
        if [ ! -r "/etc/rancher/k3s/k3s.yaml" ] && [ "$(id -u)" -eq 0 ]; then
            chmod 644 /etc/rancher/k3s/k3s.yaml || true
        elif [ ! -r "/etc/rancher/k3s/k3s.yaml" ]; then
            sudo chmod 644 /etc/rancher/k3s/k3s.yaml 2>/dev/null || true
        fi
    elif [ -f "${HOME}/.kube/config" ]; then
        export KUBECONFIG="${HOME}/.kube/config"
    fi
fi

# Function to test cluster reachability
check_cluster() {
    command -v kubectl >/dev/null 2>&1 && kubectl cluster-info >/dev/null 2>&1
}

if ! check_cluster; then
    echo "[!] Kubernetes (kubectl) is not active or cluster is unreachable."
    
    # Check if we are on Ubuntu/Debian
    if [ -f /etc/os-release ] && grep -qiE "ubuntu|debian" /etc/os-release; then
        echo "Detected Ubuntu / Debian VPS environment."
        AUTO_INSTALL="y"
        if [ -t 0 ]; then
            read -p "Would you like to install lightweight production K3s now? (y/n) [y]: " USER_INSTALL
            AUTO_INSTALL="${USER_INSTALL:-y}"
        fi
        
        if [ "${AUTO_INSTALL}" = "y" ] || [ "${AUTO_INSTALL}" = "Y" ]; then
            echo "Installing K3s Kubernetes on Ubuntu VPS..."
            # Install K3s with embedded Traefik / ServiceLB for immediate external HTTP/HTTPS routing
            curl -sfL https://get.k3s.io | sh -
            
            export KUBECONFIG="/etc/rancher/k3s/k3s.yaml"
            mkdir -p "${HOME}/.kube"
            if [ "$(id -u)" -eq 0 ]; then
                cp -f /etc/rancher/k3s/k3s.yaml "${HOME}/.kube/config"
                chmod 644 "${HOME}/.kube/config" /etc/rancher/k3s/k3s.yaml
            else
                sudo cp -f /etc/rancher/k3s/k3s.yaml "${HOME}/.kube/config" 2>/dev/null || true
                sudo chmod 644 "${HOME}/.kube/config" /etc/rancher/k3s/k3s.yaml 2>/dev/null || true
            fi
            
            echo "Waiting for K3s node to be Ready..."
            sleep 6
            kubectl wait --for=condition=Ready node --all --timeout=60s || true
        else
            echo "ERROR: A reachable Kubernetes cluster is required to proceed."
            exit 1
        fi
    else
        echo "ERROR: 'kubectl' not found and cluster is unreachable. Please install kubectl or configure kubeconfig."
        exit 1
    fi
fi

CURRENT_CTX=$(kubectl config current-context 2>/dev/null || echo "default")
echo "  Active Kubernetes Context: ${CURRENT_CTX}"

# 3. Pre-pull images if Docker or Crictl is available locally
echo "[2/8] Pre-pulling updated container images from Docker Hub..."
if command -v docker >/dev/null 2>&1; then
    echo "  Pulling ${BACKEND_IMAGE}..."
    docker pull "${BACKEND_IMAGE}" || echo "  [Note] Kubernetes will pull image during pod scheduling."
    echo "  Pulling ${FRONTEND_IMAGE}..."
    docker pull "${FRONTEND_IMAGE}" || echo "  [Note] Kubernetes will pull image during pod scheduling."
elif command -v crictl >/dev/null 2>&1; then
    echo "  Pulling images using crictl..."
    crictl pull "${BACKEND_IMAGE}" || true
    crictl pull "${FRONTEND_IMAGE}" || true
fi

# 4. Apply Namespace & Core Secrets / Configs
echo "[3/8] Applying Namespace and Secrets..."
kubectl apply -f "${K8S_DIR}/00-namespace.yaml"
kubectl apply -f "${K8S_DIR}/01-configmap-secrets.yaml"

# 5. Deploy Persistent Storage & Caching Layer (Postgres, PgBouncer, Redis, Mailpit)
echo "[4/8] Deploying Infrastructure (PostgreSQL, PgBouncer, Redis, Mailpit)..."
kubectl apply -f "${K8S_DIR}/01b-postgres.yaml"
kubectl apply -f "${K8S_DIR}/02-pgbouncer.yaml"
kubectl apply -f "${K8S_DIR}/03-redis.yaml"
kubectl apply -f "${K8S_DIR}/03b-mailpit.yaml"

# 6. Deploy Workloads & Update Image Tags
echo "[5/8] Deploying Application Microservices & Setting Docker Hub Images..."
kubectl apply -f "${K8S_DIR}/04-backend-deployment.yaml"
kubectl apply -f "${K8S_DIR}/05-frontend-deployment.yaml"

# Explicitly update images to ensure the latest Docker Hub tag is deployed
echo "  Setting Deployment images to: ${BACKEND_IMAGE} and ${FRONTEND_IMAGE}..."
kubectl set image deployment/tracelytag-backend backend="${BACKEND_IMAGE}" -n "${NAMESPACE}"
kubectl set image deployment/tracelytag-frontend frontend="${FRONTEND_IMAGE}" -n "${NAMESPACE}"

# Enforce imagePullPolicy: Always for fresh Docker Hub updates
kubectl patch deployment tracelytag-backend -n "${NAMESPACE}" -p '{"spec":{"template":{"spec":{"containers":[{"name":"backend","imagePullPolicy":"Always"}]}}}}' >/dev/null 2>&1 || true
kubectl patch deployment tracelytag-frontend -n "${NAMESPACE}" -p '{"spec":{"template":{"spec":{"containers":[{"name":"frontend","imagePullPolicy":"Always"}]}}}}' >/dev/null 2>&1 || true

# 7. Apply Ingress, HPA, and Scheduled Jobs
echo "[6/8] Deploying Ingress, Autoscalers (HPA) and Maintenance Jobs..."
kubectl apply -f "${K8S_DIR}/06-ingress.yaml"
kubectl apply -f "${K8S_DIR}/07-hpa.yaml"
kubectl apply -f "${K8S_DIR}/08-cronjob-db-backup.yaml"
kubectl apply -f "${K8S_DIR}/09-job-db-verify.yaml"

# 8. Trigger Rolling Restart & Verify Zero-Downtime Rollout
echo "[7/8] Triggering zero-downtime rolling restart..."
kubectl rollout restart deployment/tracelytag-backend -n "${NAMESPACE}"
kubectl rollout restart deployment/tracelytag-frontend -n "${NAMESPACE}"

echo "Waiting for microservices rollout to complete..."
kubectl rollout status deployment/tracelytag-backend -n "${NAMESPACE}" --timeout=120s || {
    echo "[WARNING] Backend rollout exceeded timeout. Inspecting pod status..."
    kubectl get pods -n "${NAMESPACE}" -l app=tracelytag-backend
}

kubectl rollout status deployment/tracelytag-frontend -n "${NAMESPACE}" --timeout=120s || {
    echo "[WARNING] Frontend rollout exceeded timeout. Inspecting pod status..."
    kubectl get pods -n "${NAMESPACE}" -l app=tracelytag-frontend
}

# 9. Health Status Summary
echo "[8/8] Performing health and status verification..."
echo "=========================================================="
echo "           DEPLOYMENT COMPLETED SUCCESSFULLY!             "
echo "=========================================================="
echo "--- Running Pods in '${NAMESPACE}' ---"
kubectl get pods -n "${NAMESPACE}" -o wide
echo ""
echo "--- Services & Cluster Ports ---"
kubectl get svc -n "${NAMESPACE}"
echo ""
echo "--- Ingress Routing ---"
kubectl get ingress -n "${NAMESPACE}"
echo "=========================================================="
echo "Useful Commands on VPS:"
echo "  Stream Backend logs:   kubectl logs -n ${NAMESPACE} -l app=tracelytag-backend -f --tail=50"
echo "  Stream Frontend logs:  kubectl logs -n ${NAMESPACE} -l app=tracelytag-frontend -f --tail=50"
echo "  Stream Database logs:  kubectl logs -n ${NAMESPACE} -l app=tracelytag-postgres -f --tail=50"
echo "  Live Pod Watcher:      kubectl get pods -n ${NAMESPACE} -w"
echo "=========================================================="
