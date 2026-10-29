Listed directory tracly-tag-final
Listed directory k8s
Viewed steps%20done%20ifor%20server.txt:1-11
Viewed deploy-vps.sh:1-155
Viewed deploy-k8s.sh:1-203
Viewed Jenkinsfile:1-160
Viewed Jenkinsfile:161-320
Viewed 06-ingress.yaml:1-65
Viewed documentation.md:1-100
Viewed documentation.md:101-220
Viewed documentation.md:221-345
Viewed new-k8s.md:1-82

# TracelyTag — Production VPS Architecture, CI/CD Documentation & Multi-Client DevOps Roadmap

---

## Part 1: Complete Documentation of What Was Implemented on the VPS

### 1. High-Level Architecture Overview

The system runs on an **OVH Ubuntu VPS** with an automated **Jenkins CI/CD pipeline** communicating directly with **Docker** and **K3s (Lightweight Kubernetes)** to achieve zero-downtime microservice deployments.

```
                         ┌────────────────────────────────────────┐
                         │         Developer / Git Push           │
                         └──────────────────┬─────────────────────┘
                                            │ Webhook
                                            ▼
                         ┌────────────────────────────────────────┐
                         │               GitHub                   │
                         │ (Luphonix-Prime/tracly-tag-final.git)  │
                         └──────────────────┬─────────────────────┘
                                            │ Triggers Job
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               Ubuntu Linux VPS Server                                  │
│                                                                                        │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │                    Jenkins CI/CD Engine (Port 8088)                              │  │
│  │  • Containerized runner ([Dockerfile.jenkins](file:///c:/Users/Keval/Documents/tracelytag/my-merger/tracly-tag-final/Dockerfile.jenkins))                         │  │
│  │  • Accesses host Docker daemon via `/var/run/docker.sock`                         │  │
│  │  • Accesses cluster via host gateway (`https://172.17.0.1:6443`)                 │  │
│  │  • Builds Backend & Frontend images in parallel (`--no-cache`)                    │  │
│  │  • Pushes to Docker Hub (`luphonixprime/tracly-tag-final-*`)                      │  │
│  │  • Deploys & runs rolling updates on K3s Kubernetes cluster                       │  │
│  └────────────────────────────────────────┬─────────────────────────────────────────┘  │
│                                           │ kubectl commands                           │
│                                           ▼                                            │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │                     K3s Lightweight Kubernetes Cluster                           │  │
│  │                                                                                  │  │
│  │   ┌─────────────────────────┐           ┌─────────────────────────────────────┐  │  │
│  │   │     Ingress Controller  │           │           cert-manager              │  │  │
│  │   │     (Traefik / Nginx)   │◄──────────┤   (Let's Encrypt SSL Automated)     │  │  │
│  │   └────────────┬────────────┘           └─────────────────────────────────────┘  │  │
│  │                │                                                                 │  │
│  │      ┌─────────┴─────────┐                                                       │  │
│  │      │                   │                                                       │  │
│  │      ▼ /api              ▼ /                                                     │  │
│  │  ┌───────────────┐   ┌─────────────────┐                                         │  │
│  │  │ Backend Pods  │   │ Frontend Pods   │                                         │  │
│  │  │ (Node.js API) │   │ (React + Nginx) │                                         │  │
│  │  │ 3 Replicas    │   │ 2 Replicas      │                                         │  │
│  │  └───────┬───────┘   └─────────────────┘                                         │  │
│  │          │                                                                       │  │
│  │    ┌─────┴───────────────────┐                                                   │  │
│  │    ▼                         ▼                                                   │  │
│  │ ┌──────────────────┐      ┌─────────────────┐                                    │  │
│  │ │ PgBouncer Pooler │      │ Redis Cache &   │                                    │  │
│  │ └────────┬─────────┘      │ Rate Limiter    │                                    │  │
│  │          ▼                └─────────────────┘                                    │  │
│  │ ┌──────────────────┐                                                             │  │
│  │ │ PostgreSQL 16    │                                                             │  │
│  │ │ Stateful Storage │                                                             │  │
│  │ └──────────────────┘                                                             │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 2. VPS Infrastructure & Network Setup

| Component | Target / Configuration | Details |
| :--- | :--- | :--- |
| **Operating System** | Ubuntu Linux (OVH VPS) | Clean LTS server installation |
| **Public IP** | `51.79.160.129` / `15.235.210.138` | Hosted on cloud VPS |
| **Domain DNS** | `app.tracelytag.com`, `api.tracelytag.com` | A Record mapped to VPS Public IP |
| **Jenkins Web UI** | `http://<VPS_IP>:8088` | Port offset to keep 80, 443 & 8080 free for app |
| **App Routing** | Ports `80` (HTTP) & `443` (HTTPS) | Managed by Kubernetes Ingress & cert-manager |

---

### 3. Containerization Strategy (Docker)

The application was divided into two decoupled multi-stage container images:

1. **Backend Microservice ([Dockerfile.backend](file:///c:/Users/Keval/Documents/tracelytag/my-merger/tracly-tag-final/Dockerfile.backend))**:
   - **Build Stage**: Node.js 20 Alpine, installs pnpm, compiles TypeScript, generates Prisma client schema, builds API artifacts.
   - **Runtime Stage**: Production Node.js Alpine image containing only compiled dist and production dependencies, running on port `3000`.
   - **Image Repository**: `luphonixprime/tracly-tag-final-backend:latest` and `build-${BUILD_NUMBER}`.

2. **Frontend Microservice ([Dockerfile.frontend](file:///c:/Users/Keval/Documents/tracelytag/my-merger/tracly-tag-final/Dockerfile.frontend))**:
   - **Build Stage**: Node.js 20, builds Vite/React production assets with strict chunk optimization.
   - **Runtime Stage**: High-performance Nginx Alpine web server hosting compiled static SPA assets with custom reverse proxy routing ([nginx-frontend.conf](file:///c:/Users/Keval/Documents/tracelytag/my-merger/tracly-tag-final/nginx-frontend.conf)).
   - **Image Repository**: `luphonixprime/tracly-tag-final-frontend:latest` and `build-${BUILD_NUMBER}`.

3. **Jenkins Agent Container ([Dockerfile.jenkins](file:///c:/Users/Keval/Documents/tracelytag/my-merger/tracly-tag-final/Dockerfile.jenkins))**:
   - Custom Jenkins LTS base image packaged with Docker CLI and `kubectl` so the Jenkins container can build images and deploy to Kubernetes directly.

---

### 4. Kubernetes Manifests Architecture ([k8s/](file:///c:/Users/Keval/Documents/tracelytag/my-merger/tracly-tag-final/k8s/))

The deployment is split into ordered, declarative Kubernetes manifests:

```
k8s/
├── 00-namespace.yaml          # Isolated "tracelytag" namespace
├── 01-configmap-secrets.yaml   # Environment variables, database URLs, JWT keys
├── 01b-postgres.yaml          # PostgreSQL 16 StatefulSet with PersistentVolumeClaim
├── 02-pgbouncer.yaml          # PgBouncer connection pooler (prevents DB connection exhaustion)
├── 03-redis.yaml              # Redis cache service for sessions and QR scan rate limiting
├── 04-backend-deployment.yaml  # Node.js API (3 Replicas with liveness/readiness health probes)
├── 05-frontend-deployment.yaml # React UI (2 Replicas, port 80)
├── 06-ingress.yaml            # Ingress rules for direct IP, app.tracelytag.com & api.tracelytag.com
├── 07-hpa.yaml                # Horizontal Pod Autoscaler (scales on CPU & memory pressure)
├── 08-cronjob-db-backup.yaml  # Scheduled automated PostgreSQL dump to persistent disk
└── 09-job-db-verify.yaml      # DB verification and migration test job
```

---

### 5. The Jenkins Production Pipeline ([Jenkinsfile](file:///c:/Users/Keval/Documents/tracelytag/my-merger/tracly-tag-final/Jenkinsfile))

The pipeline shown in your build dashboard executes the following automated workflow:

1. **Prepare Tools & Environment**: Validates that Docker CLI and `kubectl` are available. Verifies communication with the Docker socket (`/var/run/docker.sock`).
2. **Checkout SCM**: Clones the latest commit from GitHub branch.
3. **Purge & Reset Deployments (Optional)**: Conditional step to flush cached containers or stale pods if clean deployment is requested.
4. **Verify VPS Cluster Reachability**:
   - Copies `/etc/rancher/k3s/k3s.yaml` into workspace.
   - Detects the Docker host gateway (`172.17.0.1:6443`) to connect from inside the Jenkins container to the host K3s API server.
5. **Build Docker Images (Parallel)**:
   - Builds Backend image: `luphonixprime/tracly-tag-final-backend:build-10`
   - Builds Frontend image: `luphonixprime/tracly-tag-final-frontend:build-10`
6. **Push Images to Docker Hub**: Authenticates with `docker-hub-credentials` and pushes both version-tagged and `latest` images.
7. **Deploy Infrastructure to OVH VPS**: Applies Namespace, ConfigMaps, Postgres, PgBouncer, and Redis.
8. **Deploy Workloads & Update Image Tags**:
   - Applies backend & frontend deployments.
   - Dynamically runs `kubectl set image` to inject the new build tag into the deployment spec.
   - Applies Ingress, HPA, and scheduled CronJobs.
9. **Zero-Downtime Rollout Verification**:
   - Executes `kubectl rollout restart deployment/tracelytag-backend`.
   - Executes `kubectl rollout restart deployment/tracelytag-frontend`.
   - Blocks with `kubectl rollout status` until all new pods pass health checks and old pods terminate cleanly without downtime.
10. **Health & Cluster Status Summary**: Outputs pod status, ingress routes, and endpoints in the Jenkins console log.

---

## Part 2: DevOps Roadmap for Multi-Client Management

To scale this infrastructure from a single deployment to **hundreds of distinct clients** without operational chaos, here are the architectural upgrades:

```
                    MULTI-CLIENT DEVOPS EVOLUTION
                    
    Level 1: CURRENT STATE        Level 2: AUTOMATION        Level 3: ENTERPRISE MULTI-TENANCY
  ┌───────────────────────┐    ┌───────────────────────┐    ┌─────────────────────────────────┐
  │ • 1 VPS               │    │ • Ansible Automation  │    │ • GitOps with ArgoCD            │
  │ • Raw K8s YAMLs       │ ──►│ • Helm Charts         │ ──►│ • Namespace-per-Client          │
  │ • Manual Jenkins push │    │ • Centralized Ingress │    │ • Centralized Prometheus/Grafana│
  │ • Single Client DB    │    │ • Auto-Cert Manager   │    │ • External Secrets + Offsite S3 │
  └───────────────────────┘    └───────────────────────┘    └─────────────────────────────────┘
```

---

### 1. Configuration Management with Ansible

Instead of logging into VPS servers via SSH to run manual commands, **Ansible** gives you single-command automated provisioning.

#### A. Suggested Directory Structure
```
ansible/
├── ansible.cfg
├── inventory/
│   ├── production.ini          # List of all client VPS servers or cluster nodes
│   └── host_vars/
│       ├── client-alpha.yml    # Client Alpha domain, DB credentials, resource quotas
│       └── client-beta.yml     # Client Beta domain, DB credentials, resource quotas
├── playbooks/
│   ├── 01-bootstrap-vps.yml    # Installs Docker, K3s, Firewall, Node Exporter
│   ├── 02-provision-client.yml # Provisions new client namespace, DB, and ingress
│   └── 03-backup-clients.yml   # Backs up all client DBs and pushes to S3/B2
└── roles/
    ├── common/                 # UFW firewall, SSH keys, Fail2ban
    ├── docker/                 # Docker Engine installation & daemon config
    ├── k3s/                    # K3s server/agent bootstrap
    └── tracelytag_client/      # Client-specific Helm chart values & secrets
```

#### B. Complete Sample Playbook: Bootstrap Any New VPS (`playbooks/01-bootstrap-vps.yml`)

```yaml
---
- name: Bootstrap Production Ubuntu VPS for TracelyTag
  hosts: all
  become: true
  tasks:
    - name: Update apt cache and install core dependencies
      apt:
        update_cache: yes
        pkg:
          - curl
          - wget
          - git
          - ufw
          - fail2ban
          - apt-transport-https
          - ca-certificates

    - name: Configure UFW Firewall rules
      ufw:
        rule: allow
        port: "{{ item }}"
        proto: tcp
      loop:
        - "22"    # SSH
        - "80"    # HTTP
        - "443"   # HTTPS
        - "8088"  # Jenkins (or restricted to admin IP)
        - "6443"  # Kubernetes API (internal)

    - name: Enable UFW
      ufw:
        state: enabled

    - name: Install Docker via official get script
      shell: curl -fsSL https://get.docker.com | sh
      args:
        creates: /usr/bin/docker

    - name: Install K3s Lightweight Kubernetes
      shell: curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--write-kubeconfig-mode 644" sh -
      args:
        creates: /usr/local/bin/k3s

    - name: Install Helm Package Manager
      shell: curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
      args:
        creates: /usr/local/bin/helm
```

#### C. Sample Client Provisioning Playbook (`playbooks/02-provision-client.yml`)

```yaml
---
- name: Provision New Client Tenant on TracelyTag Cluster
  hosts: k8s_masters
  vars:
    client_name: "{{ target_client }}" # Passed via -e "target_client=acme"
  tasks:
    - name: Create Client Kubernetes Namespace
      kubernetes.core.k8s:
        name: "client-{{ client_name }}"
        kind: Namespace
        state: present

    - name: Deploy Client TracelyTag Instance via Helm
      kubernetes.core.helm:
        name: "{{ client_name }}"
        chart_ref: "/opt/charts/tracelytag"
        release_namespace: "client-{{ client_name }}"
        values_files:
          - "/opt/clients/{{ client_name }}/values.yaml"
```

To onboard a brand-new client, you run:
```bash
ansible-playbook -i inventory/production.ini playbooks/02-provision-client.yml -e "target_client=client_a"
```

---

### 2. Multi-Client Architecture Patterns: Which One to Choose?

When handling multiple clients, there are three primary models:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              Multi-Client Architecture Models                          │
├──────────────────────────┬─────────────────────────────┬───────────────────────────────┤
│ Model                    │ How It Works                │ Best Used For                 │
├──────────────────────────┼─────────────────────────────┼───────────────────────────────┤
│ Option A:                │ One K8s cluster. Each       │ Standard SaaS clients. Fast   │
│ Namespace-Per-Client     │ client has their own        │ provisioning, shared compute, │
│ (Soft Multi-Tenancy)     │ namespace, isolated DB, and │ isolated data.                │
│                          │ custom domain name.         │                               │
├──────────────────────────┼─────────────────────────────┼───────────────────────────────┤
│ Option B:                │ Entirely dedicated VPS and  │ Enterprise/VIP clients        │
│ Dedicated VPS/Cluster    │ K8s cluster for each high-  │ requiring data residency,     │
│ (Hard Multi-Tenancy)     │ value client via Ansible.   │ compliance (HIPAA/ISO).       │
├──────────────────────────┼─────────────────────────────┼───────────────────────────────┤
│ Option C:                │ Shared pods and shared DB   │ Lightweight multi-tenant web  │
│ Shared Tenant-ID Schema  │ with `tenant_id` column on  │ app with wildcard subdomain   │
│                          │ all tables.                 │ (`tenant.tracelytag.com`).    │
└──────────────────────────┴─────────────────────────────┴───────────────────────────────┘
```

> **Recommendation for TracelyTag**: **Option A (Namespace-per-Client with Helm)**
> - Provides strict database and process isolation between clients.
> - One client's heavy batch QR scan job will not crash or exhaust connections of another client.
> - Client A can be on custom domain `clienta.tracelytag.com`, Client B on `brandb.com`.

---

### 3. Replace Static YAMLs with a Reusable Helm Chart

Instead of maintaining 10 separate YAML files for each client, package TracelyTag into a single **Helm Chart**:

```
helm/tracelytag-chart/
├── Chart.yaml
├── values.yaml               # Default values
├── values-clientA.yaml       # Overrides for Client A
├── values-clientB.yaml       # Overrides for Client B
└── templates/
    ├── configmap-secrets.yaml
    ├── postgres-statefulset.yaml
    ├── backend-deployment.yaml
    ├── frontend-deployment.yaml
    ├── ingress.yaml
    └── hpa.yaml
```

**Example `values-clientA.yaml`:**
```yaml
client:
  name: "acme-corp"
  domain: "acme.tracelytag.com"
  
backend:
  replicas: 2
  resources:
    limits:
      cpu: "500m"
      memory: "512Mi"

database:
  dbName: "tracelytag_acme"
  storageSize: "20Gi"

branding:
  title: "ACME QR Traceability"
  themeColor: "#0f766e"
```

Deploying or updating any client takes one command:
```bash
helm upgrade --install acme-corp ./helm/tracelytag-chart -n client-acme --create-namespace -f values-clientA.yaml
```

---

### 4. GitOps with ArgoCD (The Next Step After Jenkins)

While Jenkins is ideal for **Continuous Integration (CI)** (running tests, building multi-stage Docker images, and pushing to Docker Hub), managing 20+ client deployments using Jenkins pipelines can become tedious.

The industry-standard companion to Jenkins is **ArgoCD**:
1. **Jenkins** builds the Docker image and updates the image tag in Git.
2. **ArgoCD** runs inside the Kubernetes cluster, monitors the Git repository, and automatically syncs changes across all client namespaces.
3. If someone manually changes a pod on the VPS, ArgoCD automatically detects configuration drift and reverts it back to the state declared in Git.

---

### 5. Multi-Client Observability & Monitoring Stack

For managing multiple clients, you need real-time insight into performance and failures:

| Tool | Purpose | Multi-Client Implementation |
| :--- | :--- | :--- |
| **Prometheus** | Metric collection | Tracks CPU, memory, API latency, and DB connections per namespace |
| **Grafana** | Visual dashboards | Pre-configured dashboard with a dropdown to filter metrics by **Client Name** |
| **Loki + Promtail** | Centralized logging | View logs for all microservices in real-time filtered by `{namespace="client-acme"}` |
| **Alertmanager** | Instant alerting | Sends alerts to Slack or Telegram if any client's API response error rate exceeds 2% |

---

### 6. Automated Backup Strategy for Multi-Tenancy

Each client's QR code scans and production mapping data must be backed up offsite:

1. **Daily Encrypted Backups**:
   - Run a lightweight Kubernetes CronJob or Ansible scheduled task executing:
     ```bash
     pg_dump -U postgres tracelytag_${CLIENT} | gzip | gpg --encrypt | aws s3 cp - s3://tracelytag-backups/${CLIENT}/$(date +%F).sql.gz.gpg
     ```
2. **Offsite Storage**: Use low-cost S3-compatible storage (e.g., Cloudflare R2, Backblaze B2, or AWS S3) with 30-day lifecycle retention policies.
3. **Automated Restore Verification**: Once per week, an automated pipeline restores the backup into a temporary test container to guarantee backups are not corrupted.

---

## Part 3: Actionable Summary & Recommended Implementation Phases

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PHASED DEVOPS ROADMAP                           │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 1 (Completed):                                                   │
│   ✔ Docker multi-stage images (Backend + Frontend)                     │
│   ✔ K3s cluster on Ubuntu OVH VPS                                      │
│   ✔ 11 Kubernetes manifests (Postgres, PgBouncer, Redis, Ingress, HPA) │
│   ✔ Jenkins automated CI/CD pipeline on port 8088                      │
│                                                                        │
│ Phase 2 (Recommended Next - 1 to 2 Weeks):                             │
│   ◻ Package k8s/ manifests into a reusable Helm Chart                  │
│   ◻ Write Ansible playbooks for VPS bootstrapping & client onboarding   │
│   ◻ Set up cert-manager for automatic wildcard SSL (*.tracelytag.com)  │
│                                                                        │
│ Phase 3 (Scaling to 10+ Clients):                                      │
│   ◻ Deploy Prometheus + Grafana with multi-tenant dashboard            │
│   ◻ Migrate deployment step from Jenkins push to ArgoCD GitOps pull    │
│   ◻ Offsite encrypted S3 backups with retention policies               │
└────────────────────────────────────────────────────────────────────────┘
```