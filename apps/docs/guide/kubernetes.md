# Kubernetes

QRForge can run on Kubernetes as a stateless Deployment backed by PostgreSQL, or as a single-replica Deployment using SQLite on a persistent volume. The manifests below are plain YAML and do not require Helm or an operator. They use the image published to `ghcr.io/kspkr/qrforge`; to use your own build, push `docker/Dockerfile` to a registry the cluster can pull from and change the `image` fields.

::: warning Rate limits are per replica
Rate limits are held in memory, so with `N` replicas each limit is effectively multiplied by `N`. Lower the `QRFORGE_RATE_LIMIT_*` values or enforce limits at the ingress if this matters for your deployment.
:::

## Option A: PostgreSQL with multiple replicas

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: qrforge
type: Opaque
stringData:
  QRFORGE_DATABASE_URL: postgres://qrforge:CHANGE_ME@postgres.db.svc:5432/qrforge?sslmode=disable
  QRFORGE_ADMIN_EMAIL: admin@example.com
  QRFORGE_ADMIN_PASSWORD: CHANGE_ME_TOO
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: qrforge
spec:
  replicas: 2
  selector:
    matchLabels: { app: qrforge }
  template:
    metadata:
      labels: { app: qrforge }
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 10001
      containers:
        - name: qrforge
          image: ghcr.io/kspkr/qrforge:0.1.0
          ports:
            - containerPort: 8080
          envFrom:
            - secretRef: { name: qrforge }
          env:
            - name: QRFORGE_BASE_URL
              value: https://qr.example.com
            - name: QRFORGE_TRUSTED_PROXIES
              value: 10.0.0.0/8          # your pod / ingress CIDR
            - name: QRFORGE_LOG_FORMAT
              value: json
          readinessProbe:
            httpGet: { path: /api/v1/health, port: 8080 }
            periodSeconds: 10
          livenessProbe:
            httpGet: { path: /api/v1/health, port: 8080 }
            periodSeconds: 30
          resources:
            requests: { cpu: 50m, memory: 64Mi }
            limits: { memory: 256Mi }
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: { drop: [ALL] }
---
apiVersion: v1
kind: Service
metadata:
  name: qrforge
spec:
  selector: { app: qrforge }
  ports:
    - port: 80
      targetPort: 8080
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: qrforge
spec:
  ingressClassName: nginx
  tls:
    - hosts: [qr.example.com]
      secretName: qrforge-tls   # e.g. issued by cert-manager + Let's Encrypt
  rules:
    - host: qr.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service: { name: qrforge, port: { number: 80 } }
```

Migrations run at startup. To avoid several replicas migrating at the same time, run a one-off `Job` with `args: ["-migrate"]` before the first rollout and before upgrades.

Any PostgreSQL 13+ server works, whether managed or run in the cluster with an operator such as CloudNativePG.

## Option B: SQLite with a single replica

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: qrforge-data
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests: { storage: 1Gi }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: qrforge
spec:
  replicas: 1
  strategy:
    type: Recreate            # never run two writers on one SQLite file
  selector:
    matchLabels: { app: qrforge }
  template:
    metadata:
      labels: { app: qrforge }
    spec:
      securityContext:
        runAsUser: 10001
        fsGroup: 10001
      containers:
        - name: qrforge
          image: ghcr.io/kspkr/qrforge:0.1.0
          ports:
            - containerPort: 8080
          env:
            - name: QRFORGE_BASE_URL
              value: https://qr.example.com
            - name: QRFORGE_DATABASE_URL
              value: sqlite:///data/qrforge.db
          volumeMounts:
            - name: data
              mountPath: /data
          readinessProbe:
            httpGet: { path: /api/v1/health, port: 8080 }
      volumes:
        - name: data
          persistentVolumeClaim: { claimName: qrforge-data }
```

Use the Service and Ingress from option A.

## Custom domains on Kubernetes

Each custom hostname needs a TLS certificate at the ingress. Either add the hostnames to the Ingress and let cert-manager issue certificates, or place Caddy in front with on-demand TLS as described in [Custom domains](./custom-domains#caddy-on-demand-tls), pointing its `ask` URL at `http://qrforge.<namespace>.svc/api/v1/domains/check`.
