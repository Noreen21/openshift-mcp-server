# Private OpenShift Cluster Configuration Examples

## 1. VPN Connection Setup

### Update kubeconfig for private cluster:
```yaml
apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://api.openshift.internal:6443  # Private cluster endpoint
    certificate-authority-data: LS0tLS1CRUdJTi...
  name: private-openshift
contexts:
- context:
    cluster: private-openshift
    user: admin
  name: private-openshift
current-context: private-openshift
users:
- name: admin
  user:
    token: sha256~abc123...
```

### Environment setup:
```bash
export KUBECONFIG=/path/to/private-cluster-kubeconfig
export HTTPS_PROXY=http://proxy.company.com:8080  # If using proxy
```

## 2. SSH Tunnel Configuration

### Create tunnel to cluster (SSH Key Authentication - Recommended):
```bash
# Forward local port 6443 to cluster API server
ssh -i ~/.ssh/id_rsa -L 6443:api.openshift.internal:6443 -N bastion.company.com

# Or use SSH config
cat ~/.ssh/config
Host openshift-tunnel
    HostName bastion.company.com
    User admin
    IdentityFile ~/.ssh/id_rsa
    LocalForward 6443 api.openshift.internal:6443
    ServerAliveInterval 60
```

### Create tunnel to cluster (Password Authentication - Optional):
```bash
# Install sshpass if not available
sudo apt-get install sshpass  # Ubuntu/Debian
# brew install sshpass        # macOS

# Forward local port 6443 to cluster API server with password
sshpass -p 'your-password' ssh -L 6443:api.openshift.internal:6443 -N bastion.company.com
```

### Update kubeconfig to use tunnel:
```yaml
clusters:
- cluster:
    server: https://localhost:6443  # Use tunneled connection
    insecure-skip-tls-verify: true  # Only for development
  name: tunneled-openshift
```

## 3. In-Cluster Deployment

### Deploy MCP server as OpenShift pod:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: openshift-mcp-server
  namespace: monitoring
spec:
  replicas: 1
  selector:
    matchLabels:
      app: openshift-mcp-server
  template:
    metadata:
      labels:
        app: openshift-mcp-server
    spec:
      serviceAccountName: openshift-mcp-server
      containers:
      - name: mcp-server
        image: openshift-mcp-server:latest
        env:
        - name: KUBERNETES_NAMESPACE
          valueFrom:
            fieldRef:
              fieldPath: metadata.namespace
        - name: NODE_ENV
          value: "production"
        ports:
        - containerPort: 3000
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

## 4. Proxy Configuration

### Corporate proxy setup:
```bash
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080
export NO_PROXY=localhost,127.0.0.1,.internal,.company.com

# For Node.js applications
export NODE_TLS_REJECT_UNAUTHORIZED=0  # Only for development with self-signed certs
```

## 5. Network Policy Considerations

### Ensure MCP server can access cluster APIs:
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-mcp-server
  namespace: monitoring
spec:
  podSelector:
    matchLabels:
      app: openshift-mcp-server
  policyTypes:
  - Egress
  egress:
  - to: []  # Allow all egress for cluster API access
    ports:
    - protocol: TCP
      port: 6443  # Kubernetes API
    - protocol: TCP
      port: 8443  # OpenShift API
```

## 6. Testing Connectivity

### Test cluster connectivity:
```bash
# Test basic connectivity
kubectl cluster-info

# Test specific APIs
kubectl get nodes
kubectl get pods --all-namespaces

# Test metrics server
kubectl top nodes
kubectl top pods

# Test OpenShift-specific APIs
oc get routes
oc get projects
```

### Troubleshooting commands:
```bash
# Check current context
kubectl config current-context

# Check cluster endpoint
kubectl config view --minify

# Test raw API access
curl -k -H "Authorization: Bearer $(oc whoami -t)" \
  https://api.openshift.internal:6443/api/v1/nodes

# Check DNS resolution
nslookup api.openshift.internal
``` 