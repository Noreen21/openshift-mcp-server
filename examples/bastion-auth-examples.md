# Bastion Host Authentication Examples

## SSH Key Authentication (Recommended)

### .cursor/settings.json
```json
{
  "mcp.servers": {
    "openshift-mcp-server": {
      "command": "/path/to/cursor-kube-mcp-server/scripts/remote-mcp-wrapper.sh",
      "args": [],
      "env": {
        "MCP_BASTION_HOST": "bastion.company.com",
        "MCP_BASTION_USER": "admin",
        "MCP_REMOTE_PATH": "/opt/cursor-kube-mcp-server",
        "MCP_SSH_KEY": "~/.ssh/id_rsa",
        "MCP_REMOTE_KUBECONFIG": "~/.kube/config",
        "MCP_REMOTE_NODE_ENV": "production"
      }
    }
  }
}
```

### Environment Variables
```bash
export MCP_BASTION_HOST="bastion.company.com"
export MCP_BASTION_USER="admin"
export MCP_SSH_KEY="~/.ssh/id_rsa"
export MCP_REMOTE_KUBECONFIG="~/.kube/config"
```

## Password Authentication (Optional)

### .cursor/settings.json
```json
{
  "mcp.servers": {
    "openshift-mcp-server": {
      "command": "/path/to/cursor-kube-mcp-server/scripts/remote-mcp-wrapper.sh",
      "args": [],
      "env": {
        "MCP_BASTION_HOST": "bastion.company.com",
        "MCP_BASTION_USER": "admin",
        "MCP_BASTION_PASSWORD": "your-secure-password",
        "MCP_REMOTE_PATH": "/opt/cursor-kube-mcp-server",
        "MCP_REMOTE_KUBECONFIG": "~/.kube/config",
        "MCP_REMOTE_NODE_ENV": "production"
      }
    }
  }
}
```

### Environment Variables
```bash
export MCP_BASTION_HOST="bastion.company.com"
export MCP_BASTION_USER="admin"
export MCP_BASTION_PASSWORD="your-secure-password"
export MCP_REMOTE_KUBECONFIG="~/.kube/config"
```

### Prerequisites for Password Auth
```bash
# Install sshpass on your local machine
# Ubuntu/Debian:
sudo apt-get install sshpass

# macOS:
brew install sshpass

# RHEL/CentOS:
sudo yum install sshpass
```

## SSH Key Setup

### Prerequisites
```bash
# Generate SSH key pair if you don't have one
ssh-keygen -t ed25519 -f ~/.ssh/id_rsa_bastion -C "mcp-server-access"

# Copy public key to bastion host
ssh-copy-id -i ~/.ssh/id_rsa_bastion.pub admin@bastion.company.com

# Test connectivity
ssh -i ~/.ssh/id_rsa_bastion admin@bastion.company.com
```

## Custom Kubeconfig Location

### For non-standard kubeconfig paths
```json
{
  "env": {
    "MCP_BASTION_HOST": "bastion.company.com",
    "MCP_BASTION_USER": "admin",
    "MCP_REMOTE_KUBECONFIG": "/etc/kubernetes/admin.conf",
    "MCP_REMOTE_NODE_ENV": "development"
  }
}
```

### Multiple cluster configs
```json
{
  "env": {
    "MCP_BASTION_HOST": "bastion.company.com",
    "MCP_BASTION_USER": "admin", 
    "MCP_REMOTE_KUBECONFIG": "/home/admin/.kube/prod-cluster-config",
    "MCP_REMOTE_NODE_ENV": "production"
  }
}
```

## Development vs Production

### Development Configuration
```json
{
  "env": {
    "MCP_BASTION_HOST": "dev-bastion.company.com",
    "MCP_BASTION_USER": "developer",
    "MCP_REMOTE_KUBECONFIG": "~/.kube/dev-config",
    "MCP_REMOTE_NODE_ENV": "development"
  }
}
```

### Production Configuration
```json
{
  "env": {
    "MCP_BASTION_HOST": "prod-bastion.company.com",
    "MCP_BASTION_USER": "admin",
    "MCP_REMOTE_KUBECONFIG": "~/.kube/prod-config",
    "MCP_REMOTE_NODE_ENV": "production"
  }
}
```

## High Availability Setup

### Primary Bastion
```json
{
  "mcp.servers": {
    "openshift-mcp-server-primary": {
      "command": "/path/to/cursor-kube-mcp-server/scripts/remote-mcp-wrapper.sh",
      "env": {
        "MCP_BASTION_HOST": "bastion1.company.com",
        "MCP_BASTION_USER": "admin",
        "MCP_SSH_KEY": "~/.ssh/id_rsa",
        "MCP_REMOTE_KUBECONFIG": "~/.kube/cluster1-config"
      }
    }
  }
}
```

### Secondary Bastion
```json
{
  "mcp.servers": {
    "openshift-mcp-server-secondary": {
      "command": "/path/to/cursor-kube-mcp-server/scripts/remote-mcp-wrapper.sh",
      "env": {
        "MCP_BASTION_HOST": "bastion2.company.com",
        "MCP_BASTION_USER": "admin",
        "MCP_SSH_KEY": "~/.ssh/id_rsa",
        "MCP_REMOTE_KUBECONFIG": "~/.kube/cluster2-config"
      }
    }
  }
}
```

## Security Best Practices

### 1. Authentication Method Selection
- **Prefer SSH keys** over passwords for better security
- Use passwords only when SSH keys are not feasible
- For password auth: use strong, unique passwords
- Consider using environment variables instead of config files for passwords

### 2. SSH Key Management (Recommended)
- Use dedicated SSH keys for MCP access
- Regularly rotate SSH keys
- Use strong passphrases for private keys
- Store private keys securely

### 3. Password Security (If Using Password Auth)
```bash
# Use environment variables instead of hardcoding
export MCP_BASTION_PASSWORD="$(cat ~/.mcp-bastion-password)"

# Or use a password manager
export MCP_BASTION_PASSWORD="$(pass show mcp/bastion-password)"

# Avoid storing passwords in version control
echo "*.password" >> .gitignore
echo ".env" >> .gitignore
```

### 4. SSH Key Generation Best Practices
```bash
# Generate modern Ed25519 key (recommended)
ssh-keygen -t ed25519 -f ~/.ssh/mcp-bastion-key -C "mcp-server-access"

# Or RSA 4096-bit if Ed25519 is not supported
ssh-keygen -t rsa -b 4096 -f ~/.ssh/mcp-bastion-key -C "mcp-server-access"

# Set proper permissions
chmod 600 ~/.ssh/mcp-bastion-key
chmod 644 ~/.ssh/mcp-bastion-key.pub
```

### 5. Restrict SSH Access on Bastion Host
```bash
# On bastion host: /etc/ssh/sshd_config
AllowUsers admin
PasswordAuthentication no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
PermitRootLogin no
```

### 6. Use SSH Agent for Key Management
```bash
# Start SSH agent
eval "$(ssh-agent -s)"

# Add your key to agent
ssh-add ~/.ssh/mcp-bastion-key

# Use in configuration
export MCP_SSH_KEY="~/.ssh/mcp-bastion-key"
```

## Troubleshooting

### Connection Issues

**SSH Key Authentication:**
```bash
# Test basic connectivity
ssh -v -i ~/.ssh/id_rsa admin@bastion-host

# Test with specific key
ssh -i ~/.ssh/mcp-key admin@bastion-host

# Debug SSH connection
ssh -vvv -i ~/.ssh/id_rsa admin@bastion-host
```

**Password Authentication:**
```bash
# Test basic connectivity with password
sshpass -p 'your-password' ssh -v admin@bastion-host

# Debug password authentication
sshpass -p 'your-password' ssh -vvv admin@bastion-host
```

### Common Issues

1. **Permission denied (publickey)** - SSH Key Auth
   - Ensure public key is in `~/.ssh/authorized_keys` on bastion host
   - Check file permissions: `chmod 600 ~/.ssh/authorized_keys`
   - Verify SSH key path is correct

2. **Permission denied (password)** - Password Auth
   - Verify password is correct
   - Check if password authentication is enabled on bastion host
   - Ensure sshpass is installed locally
   - Check if account is not locked

3. **Connection timeout**
   - Check network connectivity to bastion host
   - Verify firewall rules allow SSH (port 22)
   - Test with `telnet bastion-host 22`

4. **SSH key not found**
   - Verify SSH key exists: `ls -la ~/.ssh/`
   - Check MCP_SSH_KEY environment variable
   - Ensure key has correct permissions: `chmod 600 ~/.ssh/private_key`

5. **sshpass not found** - Password Auth
   - Install sshpass: `sudo apt-get install sshpass` (Ubuntu/Debian)
   - Or: `brew install sshpass` (macOS)
   - Or: `sudo yum install sshpass` (RHEL/CentOS)

### Verification Commands

**SSH Key Authentication:**
```bash
# Test SSH connectivity
ssh -i ~/.ssh/id_rsa -o ConnectTimeout=10 admin@bastion-host "echo 'Connection successful'"

# Test MCP setup script
export MCP_BASTION_HOST="bastion.company.com"
export MCP_BASTION_USER="admin"
export MCP_SSH_KEY="~/.ssh/id_rsa"
./scripts/setup-bastion.sh

# Test MCP wrapper
./scripts/remote-mcp-wrapper.sh
```

**Password Authentication:**
```bash
# Test SSH connectivity with password
sshpass -p 'your-password' ssh -o ConnectTimeout=10 admin@bastion-host "echo 'Connection successful'"

# Test MCP setup script with password
export MCP_BASTION_HOST="bastion.company.com"
export MCP_BASTION_USER="admin"
export MCP_BASTION_PASSWORD="your-secure-password"
./scripts/setup-bastion.sh

# Test MCP wrapper with password
./scripts/remote-mcp-wrapper.sh
``` 