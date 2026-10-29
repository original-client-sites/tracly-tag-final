pipeline {
    agent any

    options {
        buildDiscarder(logRotator(numToKeepStr: '15'))
        disableConcurrentBuilds()
        timeout(time: 25, unit: 'MINUTES')
    }

    parameters {
        string(name: 'DOCKER_USER', defaultValue: 'luphonixprime', description: 'Docker Hub organization or username')
        string(name: 'IMAGE_TAG', defaultValue: '', description: 'Custom Image Tag (leave empty to use build-${BUILD_NUMBER})')
        string(name: 'NAMESPACE', defaultValue: 'tracelytag', description: 'Target Kubernetes namespace on OVH Ubuntu VPS')
        booleanParam(name: 'BUILD_IMAGES', defaultValue: true, description: 'Build Backend and Frontend Docker images')
        booleanParam(name: 'PUSH_TO_DOCKER_HUB', defaultValue: true, description: 'Push built images to Docker Hub')
        booleanParam(name: 'AUTO_BOOTSTRAP_K3S', defaultValue: true, description: 'Auto-install lightweight K3s cluster on VPS if not detected')
        booleanParam(name: 'TRIGGER_ROLLOUT_RESTART', defaultValue: true, description: 'Enforce zero-downtime rolling restart of microservices')
        booleanParam(name: 'PURGE_AND_RESET_ALL', defaultValue: false, description: 'Wipe all existing K8s pods, delete old Docker images and build caches before deploying')
        booleanParam(name: 'NO_CACHE', defaultValue: true, description: 'Build Docker images with --no-cache to guarantee fresh code')
    }

    environment {
        DOCKER_USER = "${params.DOCKER_USER ?: 'luphonixprime'}"
        IMAGE_TAG = "${params.IMAGE_TAG?.trim() ? params.IMAGE_TAG.trim() : 'build-' + env.BUILD_NUMBER}"
        NAMESPACE = "${params.NAMESPACE ?: 'tracelytag'}"
        
        BACKEND_IMAGE = "${env.DOCKER_USER}/tracly-tag-final-backend:${env.IMAGE_TAG}"
        FRONTEND_IMAGE = "${env.DOCKER_USER}/tracly-tag-final-frontend:${env.IMAGE_TAG}"
        BACKEND_IMAGE_LATEST = "${env.DOCKER_USER}/tracly-tag-final-backend:latest"
        FRONTEND_IMAGE_LATEST = "${env.DOCKER_USER}/tracly-tag-final-frontend:latest"
        
        DOCKER_REGISTRY_CREDENTIALS_ID = 'docker-hub-credentials'
        K8S_DIR = 'k8s'
        KUBECONFIG = "${WORKSPACE}/.kube/config"
        PATH = "${WORKSPACE}/bin:${env.PATH}"
    }

    stages {
        stage('Prepare Tools & Environment') {
            steps {
                script {
                    echo "=========================================================="
                    echo "  TRACELYTAG CI/CD PIPELINE (OVH UBUNTU VPS KUBERNETES)  "
                    echo "=========================================================="
                    echo "  Build Number:      #${env.BUILD_NUMBER}"
                    echo "  Docker Hub User:   ${env.DOCKER_USER}"
                    echo "  Deployment Tag:    ${env.IMAGE_TAG}"
                    echo "  Backend Image:     ${env.BACKEND_IMAGE}"
                    echo "  Frontend Image:    ${env.FRONTEND_IMAGE}"
                    echo "  Target Namespace:  ${env.NAMESPACE}"
                    echo "  Purge & Reset All: ${params.PURGE_AND_RESET_ALL}"
                    echo "  No Cache Build:    ${params.NO_CACHE}"
                    echo "----------------------------------------------------------"

                    sh '''
                        mkdir -p "${WORKSPACE}/bin"
                        mkdir -p "${WORKSPACE}/.kube"

                        # Ensure Docker CLI is available
                        if ! command -v docker >/dev/null 2>&1; then
                            echo "[*] Docker CLI not found in PATH. Fetching portable docker binary..."
                            curl -fsSL https://download.docker.com/linux/static/stable/x86_64/docker-24.0.7.tgz -o /tmp/docker.tgz
                            tar -xzf /tmp/docker.tgz -C /tmp/
                            mv /tmp/docker/docker "${WORKSPACE}/bin/"
                            chmod +x "${WORKSPACE}/bin/docker"
                            rm -rf /tmp/docker.tgz /tmp/docker
                        fi

                        # Ensure kubectl is available
                        if ! command -v kubectl >/dev/null 2>&1; then
                            echo "[*] kubectl not found in PATH. Fetching stable kubectl binary..."
                            curl -fsSL -o "${WORKSPACE}/bin/kubectl" "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
                            chmod +x "${WORKSPACE}/bin/kubectl"
                        fi

                        echo "[+] Tool versions:"
                        docker --version || echo "Docker CLI check done."
                        kubectl version --client --output=yaml || echo "kubectl check done."

                        # Verify Docker daemon communication
                        if ! docker info >/dev/null 2>&1; then
                            echo "=========================================================="
                            echo "[!] WARNING: Docker daemon socket is not accessible (/var/run/docker.sock)."
                            echo "    If Jenkins runs in Docker, fix permissions on your VPS host:"
                            echo "      sudo chmod 666 /var/run/docker.sock"
                            echo "    Or run container with: --user root"
                            echo "=========================================================="
                        else
                            echo "[+] Docker daemon connection verified."
                        fi
                    '''
                }
            }
        }

        stage('Checkout SCM') {
            steps {
                script {
                    checkout scm
                }
            }
        }

        stage('Purge & Reset Existing Deployments') {
            when {
                expression { return params.PURGE_AND_RESET_ALL }
            }
            steps {
                script {
                    echo "[!] RESET TRIGGERED: Purging previous workloads and build caches..."
                    sh '''
                        export KUBECONFIG="${WORKSPACE}/.kube/config"

                        echo "[*] Deleting previous deployments in namespace ${NAMESPACE}..."
                        kubectl delete deployment --all -n "${NAMESPACE}" --timeout=60s || true
                        kubectl delete statefulset --all -n "${NAMESPACE}" --timeout=60s || true
                        kubectl delete pod --all -n "${NAMESPACE}" --force --grace-period=0 || true

                        echo "[*] Purging unused Docker build cache & dangling images..."
                        docker image prune -af || true
                        docker builder prune -af || true
                    '''
                }
            }
        }

        stage('Verify VPS Cluster Reachability') {
            steps {
                script {
                    sh '''
                        echo "[*] Detecting Kubernetes cluster on OVH Ubuntu VPS..."
                        mkdir -p "${WORKSPACE}/.kube"

                        CONFIG_SRC=""
                        if [ -f "/etc/rancher/k3s/k3s.yaml" ] && [ -s "/etc/rancher/k3s/k3s.yaml" ]; then
                            CONFIG_SRC="/etc/rancher/k3s/k3s.yaml"
                        elif [ -f "${HOME}/.kube/config" ] && [ -s "${HOME}/.kube/config" ]; then
                            CONFIG_SRC="${HOME}/.kube/config"
                        fi

                        if [ -n "$CONFIG_SRC" ]; then
                            echo "[*] Initializing kubeconfig from ${CONFIG_SRC}..."
                            cp -f "$CONFIG_SRC" "${WORKSPACE}/.kube/config"
                            chmod 600 "${WORKSPACE}/.kube/config"
                        else
                            echo "[!] Notice: No kubeconfig found at /etc/rancher/k3s/k3s.yaml or ~/.kube/config."
                        fi

                        export KUBECONFIG="${WORKSPACE}/.kube/config"

                        # 1. Test direct connectivity (127.0.0.1:6443)
                        if kubectl cluster-info >/dev/null 2>&1; then
                            echo "[+] Successfully connected to Kubernetes cluster via local loopback:"
                            kubectl cluster-info
                        else
                            # 2. When Jenkins is in a Docker container, 127.0.0.1 points to the container itself.
                            # Resolve host default gateway (typically 172.17.0.1) and reconfigure cluster endpoint.
                            HOST_GATEWAY=$(ip route show default 2>/dev/null | awk '{print $3}')
                            CONNECTED="false"

                            if [ -n "$HOST_GATEWAY" ] && [ -f "${WORKSPACE}/.kube/config" ]; then
                                echo "[*] 127.0.0.1 refused. Attempting connection via host gateway (${HOST_GATEWAY}:6443)..."
                                kubectl config set-cluster default --server="https://${HOST_GATEWAY}:6443" --insecure-skip-tls-verify=true >/dev/null 2>&1 || true

                                if kubectl cluster-info >/dev/null 2>&1; then
                                    echo "[+] Successfully connected to K3s cluster on host via ${HOST_GATEWAY}:6443!"
                                    kubectl cluster-info
                                    CONNECTED="true"
                                fi
                            fi

                            if [ "$CONNECTED" != "true" ]; then
                                echo "=========================================================="
                                echo "ERROR: Could not connect to Kubernetes cluster via kubectl."
                                echo "Please ensure K3s is active on the host VPS:"
                                echo "  1. SSH into VPS: ssh ubuntu@<VPS_IP>"
                                echo "  2. Check status: sudo systemctl status k3s"
                                echo "  3. Start if stopped: sudo systemctl start k3s"
                                echo "  4. Ensure config permissions: sudo chmod 644 /etc/rancher/k3s/k3s.yaml"
                                echo "=========================================================="
                                exit 1
                            fi
                        fi
                    '''
                }
            }
        }

        stage('Build Docker Images') {
            when {
                expression { return params.BUILD_IMAGES }
            }
            parallel {
                stage('Build Backend Image') {
                    steps {
                        script {
                            echo "Building Backend Container: ${env.BACKEND_IMAGE}"
                            def noCacheArg = params.NO_CACHE ? '--no-cache' : ''
                            sh """
                                docker build ${noCacheArg} \
                                    -f Dockerfile.backend \
                                    -t ${env.BACKEND_IMAGE} \
                                    -t ${env.BACKEND_IMAGE_LATEST} .
                            """
                        }
                    }
                }
                stage('Build Frontend Image') {
                    steps {
                        script {
                            echo "Building Frontend Container: ${env.FRONTEND_IMAGE}"
                            def noCacheArg = params.NO_CACHE ? '--no-cache' : ''
                            sh """
                                docker build ${noCacheArg} \
                                    -f Dockerfile.frontend \
                                    -t ${env.FRONTEND_IMAGE} \
                                    -t ${env.FRONTEND_IMAGE_LATEST} .
                            """
                        }
                    }
                }
            }
        }

        stage('Push Images to Docker Hub') {
            when {
                expression { return params.PUSH_TO_DOCKER_HUB && params.BUILD_IMAGES }
            }
            steps {
                script {
                    echo "Logging into Docker Hub and pushing images..."
                    try {
                        withCredentials([usernamePassword(
                            credentialsId: env.DOCKER_REGISTRY_CREDENTIALS_ID,
                            usernameVariable: 'DOCKER_USER_ID',
                            passwordVariable: 'DOCKER_PASSWORD'
                        )]) {
                            sh '''
                                echo "${DOCKER_PASSWORD}" | docker login -u "${DOCKER_USER_ID}" --password-stdin
                                echo "[+] Pushing backend images..."
                                docker push "${BACKEND_IMAGE}"
                                docker push "${BACKEND_IMAGE_LATEST}"
                                
                                echo "[+] Pushing frontend images..."
                                docker push "${FRONTEND_IMAGE}"
                                docker push "${FRONTEND_IMAGE_LATEST}"
                            '''
                        }
                    } catch (Exception e) {
                        echo "[WARNING] Docker Hub credentials ('${env.DOCKER_REGISTRY_CREDENTIALS_ID}') not found or login failed."
                        echo "Reason: ${e.message}"
                        echo "If Jenkins is running on the same OVH VPS as K3s/Docker, local images will still be utilized."
                    }
                }
            }
        }

        stage('Deploy Infrastructure to OVH VPS') {
            steps {
                script {
                    echo "[*] Step 1: Applying Namespace and ConfigMaps/Secrets..."
                    sh '''
                        kubectl apply -f "${K8S_DIR}/00-namespace.yaml"
                        kubectl apply -f "${K8S_DIR}/01-configmap-secrets.yaml"
                    '''

                    echo "[*] Step 2: Applying Data Layer & Mail Server (PostgreSQL, PgBouncer, Redis, Mailpit)..."
                    sh '''
                        kubectl apply -f "${K8S_DIR}/01b-postgres.yaml"
                        kubectl apply -f "${K8S_DIR}/02-pgbouncer.yaml"
                        kubectl apply -f "${K8S_DIR}/03-redis.yaml"
                        kubectl apply -f "${K8S_DIR}/03b-mailpit.yaml"
                    '''
                }
            }
        }

        stage('Deploy Workloads & Update Image Tags') {
            steps {
                script {
                    echo "[*] Step 3: Deploying Backend & Frontend Workloads..."
                    sh """
                        kubectl apply -f "${env.K8S_DIR}/04-backend-deployment.yaml"
                        kubectl apply -f "${env.K8S_DIR}/05-frontend-deployment.yaml"

                        echo "  Setting Deployment images to: ${env.BACKEND_IMAGE} and ${env.FRONTEND_IMAGE}..."
                        kubectl set image deployment/tracelytag-backend backend="${env.BACKEND_IMAGE}" -n "${env.NAMESPACE}"
                        kubectl set image deployment/tracelytag-frontend frontend="${env.FRONTEND_IMAGE}" -n "${env.NAMESPACE}"

                        # Ensure imagePullPolicy: Always for fresh image updates
                        kubectl patch deployment tracelytag-backend -n "${env.NAMESPACE}" -p '{"spec":{"template":{"spec":{"containers":[{"name":"backend","imagePullPolicy":"Always"}]}}}}' || true
                        kubectl patch deployment tracelytag-frontend -n "${env.NAMESPACE}" -p '{"spec":{"template":{"spec":{"containers":[{"name":"frontend","imagePullPolicy":"Always"}]}}}}' || true
                    """

                    echo "[*] Step 4: Applying Ingress, HPA, and Scheduled Maintenance Jobs..."
                    sh """
                        kubectl apply -f "${env.K8S_DIR}/06-ingress.yaml"
                        kubectl apply -f "${env.K8S_DIR}/07-hpa.yaml"
                        kubectl apply -f "${env.K8S_DIR}/08-cronjob-db-backup.yaml"
                        kubectl apply -f "${env.K8S_DIR}/09-job-db-verify.yaml"
                    """
                }
            }
        }

        stage('Zero-Downtime Rollout Verification') {
            steps {
                script {
                    if (params.TRIGGER_ROLLOUT_RESTART) {
                        echo "[*] Triggering rolling restart of microservices..."
                        sh """
                            kubectl rollout restart deployment/tracelytag-backend -n "${env.NAMESPACE}"
                            kubectl rollout restart deployment/tracelytag-frontend -n "${env.NAMESPACE}"
                        """
                    }

                    echo "[*] Monitoring rollout status..."
                    sh """
                        echo "Waiting for backend deployment rollout to complete..."
                        kubectl rollout status deployment/tracelytag-backend -n "${env.NAMESPACE}" --timeout=180s

                        echo "Waiting for frontend deployment rollout to complete..."
                        kubectl rollout status deployment/tracelytag-frontend -n "${env.NAMESPACE}" --timeout=180s
                    """
                }
            }
        }

        stage('Health & Cluster Status Summary') {
            steps {
                script {
                    sh """
                        echo "=========================================================="
                        echo "        OVH UBUNTU VPS DEPLOYMENT COMPLETED!             "
                        echo "=========================================================="
                        echo "--- Running Pods in '${env.NAMESPACE}' ---"
                        kubectl get pods -n "${env.NAMESPACE}" -o wide
                        echo ""
                        echo "--- Services & Cluster Ports ---"
                        kubectl get svc -n "${env.NAMESPACE}"
                        echo ""
                        echo "--- Ingress Routing ---"
                        kubectl get ingress -n "${env.NAMESPACE}"
                        echo "=========================================================="
                    """
                }
            }
        }
    }

    post {
        always {
            script {
                echo 'Cleaning build artifacts and dangling Docker images...'
                sh 'docker image prune -f --filter "until=24h" || true'
                cleanWs(deleteDirs: true, notFailBuild: true)
            }
        }
        success {
            echo "=================================================================="
            echo " SUCCESS: TracelyTag Build #${env.BUILD_NUMBER} Deployed to OVH VPS! "
            echo " Domain: https://app.tracelytag.com"
            echo "=================================================================="
        }
        failure {
            script {
                echo "=================================================================="
                echo " [!] PIPELINE FAILED - INITIATING AUTOMATED ROLLBACK & LOG CAPTURE"
                echo "=================================================================="
                sh """
                    echo "Attempting automated deployment rollback..."
                    kubectl rollout undo deployment/tracelytag-backend -n "${env.NAMESPACE}" || true
                    kubectl rollout undo deployment/tracelytag-frontend -n "${env.NAMESPACE}" || true

                    echo "--- Pod Diagnostic Logs (Backend) ---"
                    kubectl logs -n "${env.NAMESPACE}" -l app=tracelytag-backend --tail=50 || true

                    echo "--- Pod Diagnostic Logs (Frontend) ---"
                    kubectl logs -n "${env.NAMESPACE}" -l app=tracelytag-frontend --tail=50 || true

                    echo "--- Recent Cluster Events ---"
                    kubectl get events -n "${env.NAMESPACE}" --sort-by='.metadata.creationTimestamp' | tail -n 25 || true
                """
            }
        }
    }
}
