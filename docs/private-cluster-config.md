# Private OpenShift Cluster Configuration for MCP Server

This guide shows how to configure the OpenShift MCP Server to access private OpenShift clusters that are not directly accessible from your local development environment.

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
export HTTPS_PROXY=http://proxy.example.com:8080  # If using proxy
```

## 2. SSH Tunnel Configuration

### Create tunnel to cluster (SSH Key Authentication - Recommended):
```bash
# Forward local port 6443 to cluster API server
ssh -i ~/.ssh/id_rsa -L 6443:api.openshift.internal:6443 -N bastion.example.com

# Or use SSH config
cat ~/.ssh/config
Host openshift-tunnel
    HostName bastion.example.com
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
sshpass -p 'your-password' ssh -L 6443:api.openshift.internal:6443 -N bastion.example.com
```

### Update kubeconfig to use tunnel:
```yaml
clusters:
- cluster:
    server: https://localhost:6443  # Use tunneled connection
    insecure-skip-tls-verify: true  # Only for development
  name: tunneled-openshift
```

## 3. Bastion Host Deployment (Recommended)

### Deploy MCP server on bastion host:
```bash
# Use the setup script to deploy to bastion host
export MCP_BASTION_HOST=bastion.example.com
export MCP_BASTION_USER=admin
export MCP_SSH_KEY=~/.ssh/id_rsa
export MCP_REMOTE_KUBECONFIG=/path/to/kubeconfig/on/bastion

# Deploy using setup script
scripts/setup-bastion.sh
```

### Configure Cursor IDE to use remote MCP server:
```json
{
  "mcpServers": {
    "openshift_mcp_server": {
      "command": "ssh",
      "args": [
        "-i", "~/.ssh/id_rsa",
        "admin@bastion.example.com",
        "cd /opt/openshift-mcp-server && KUBECONFIG=/path/to/kubeconfig node index.js"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

## 4. Proxy Configuration

### Corporate proxy setup:
```bash
export HTTP_PROXY=http://proxy.example.com:8080
export HTTPS_PROXY=http://proxy.example.com:8080
export NO_PROXY=localhost,127.0.0.1,.internal,.example.com

# For Node.js applications
export NODE_TLS_REJECT_UNAUTHORIZED=0  # Only for development with self-signed certs
```

## 5. Testing Connectivity

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

### Test MCP server functionality:
```bash
# Test MCP server tools
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"check_cluster_health","arguments":{}}}' | node index.js

# Test specific MCP tools
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_performance_metrics","arguments":{"timeRange":"1h"}}}' | node index.js
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

# Test SSH connectivity to bastion
ssh -i ~/.ssh/id_rsa admin@bastion.example.com "echo 'SSH connection successful'"
```

## 6. Security Considerations

### Best practices for private cluster access:
- Use SSH key authentication instead of passwords
- Limit SSH access to specific source IPs
- Use jump hosts/bastion hosts for secure access
- Rotate SSH keys and cluster tokens regularly
- Enable SSH key forwarding carefully
- Use VPN connections when available
- Avoid storing sensitive credentials in configuration files

### Network security:
- Ensure firewall rules allow necessary connectivity
- Use encrypted connections (TLS/SSL) for all cluster communication
- Consider using service mesh for additional security layers
- Monitor access logs on bastion hosts
