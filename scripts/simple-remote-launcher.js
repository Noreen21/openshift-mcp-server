#!/usr/bin/env node

import { spawn } from 'child_process';
import { existsSync } from 'fs';

// MCP-Compatible Remote Launcher
// Simplified for reliable MCP protocol communication

// Configuration with defaults
const config = {
  bastionHost: process.env.MCP_BASTION_HOST || 'bastion.company.com',
  bastionUser: process.env.MCP_BASTION_USER || 'admin', 
  bastionPassword: process.env.MCP_BASTION_PASSWORD || '',
  remotePath: process.env.MCP_REMOTE_PATH || '/opt/openshift-mcp-server',
  sshKey: process.env.MCP_SSH_KEY || '~/.ssh/id_rsa',
  remoteKubeconfig: process.env.MCP_REMOTE_KUBECONFIG || '~/.kube/config',
  remoteNodeEnv: process.env.MCP_REMOTE_NODE_ENV || 'production'
};

// Quick validation (no logging to avoid MCP interference)
function validateConfig() {
  const required = ['bastionHost', 'bastionUser', 'remotePath', 'remoteKubeconfig'];
  const missing = required.filter(key => !config[key] || config[key] === 'bastion.company.com');
  
  if (missing.length > 0) {
    process.exit(1);
  }
  
  // Check SSH key exists if using key auth (no output)
  if (!config.bastionPassword && !existsSync(config.sshKey.replace('~', process.env.HOME))) {
    process.exit(1);
  }
}

// Main launcher function - simplified for MCP compatibility
function launchMCPServer() {
  try {
    // Quick validation only
    validateConfig();
    
    // Build SSH command based on auth method
    const sshArgs = config.bastionPassword ? [
      'sshpass', '-p', config.bastionPassword, 'ssh',
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ServerAliveInterval=60',
      '-o', 'ServerAliveCountMax=3',
      '-o', 'LogLevel=ERROR',  // Suppress SSH noise
      `${config.bastionUser}@${config.bastionHost}`,
      `cd '${config.remotePath}' && MCP_REMOTE_KUBECONFIG='${config.remoteKubeconfig}' NODE_ENV='${config.remoteNodeEnv}' exec node index.js`
    ] : [
      'ssh',
      '-i', config.sshKey,
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ServerAliveInterval=60', 
      '-o', 'ServerAliveCountMax=3',
      '-o', 'LogLevel=ERROR',  // Suppress SSH noise
      `${config.bastionUser}@${config.bastionHost}`,
      `cd '${config.remotePath}' && MCP_REMOTE_KUBECONFIG='${config.remoteKubeconfig}' NODE_ENV='${config.remoteNodeEnv}' exec node index.js`
    ];
    
    // Launch immediately for MCP compatibility
    const ssh = spawn(sshArgs[0], sshArgs.slice(1), { 
      stdio: 'inherit',
      // Ensure clean environment for MCP
      env: { ...process.env }
    });
    
    // Minimal error handling to avoid interfering with MCP
    ssh.on('close', (code) => {
      process.exit(code || 0);
    });
    
    ssh.on('error', () => {
      process.exit(1);
    });
    
    // Handle signals cleanly
    process.on('SIGTERM', () => ssh.kill('SIGTERM'));
    process.on('SIGINT', () => ssh.kill('SIGINT'));
    
  } catch (err) {
    process.exit(1);
  }
}

// Start immediately for MCP compatibility
launchMCPServer(); 