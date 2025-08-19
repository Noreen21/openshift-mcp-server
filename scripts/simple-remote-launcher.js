#!/usr/bin/env node

import { spawn } from 'child_process';
import { existsSync } from 'fs';

// MCP-Compatible Remote Launcher with CLI Arguments Support
// Supports both environment variables and command line arguments
// CLI arguments take precedence over environment variables

function parseArguments() {
  const args = process.argv.slice(2);
  const config = {
    bastionHost: process.env.MCP_BASTION_HOST || 'bastion.example.com',
    bastionUser: process.env.MCP_BASTION_USER || 'admin', 
    bastionPassword: process.env.MCP_BASTION_PASSWORD || '',
    remotePath: process.env.MCP_REMOTE_PATH || '/opt/openshift-mcp-server',
    sshKey: process.env.MCP_SSH_KEY || '~/.ssh/id_rsa',
    remoteKubeconfig: process.env.MCP_REMOTE_KUBECONFIG || '~/.kube/config',
    remoteNodeEnv: process.env.MCP_REMOTE_NODE_ENV || 'production'
  };

  // Parse command line arguments (CLI args override env vars)
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '-H':
      case '--host':
        config.bastionHost = args[++i];
        break;
      case '-U':
      case '--user':
        config.bastionUser = args[++i];
        break;
      case '-P':
      case '--password':
        config.bastionPassword = args[++i];
        break;
      case '-p':
      case '--path':
        config.remotePath = args[++i];
        break;
      case '-s':
      case '--ssh-key':
        config.sshKey = args[++i];
        break;
      case '-k':
      case '--kubeconfig':
        config.remoteKubeconfig = args[++i];
        break;
      case '-e':
      case '--env':
        config.remoteNodeEnv = args[++i];
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
      default:
        // Handle unknown arguments or pass them through if needed
        break;
    }
  }
  return config;
}

function printHelp() {
  console.log(`
Usage: simple-remote-launcher.js [options]

Options:
  -H, --host <host>           Bastion host address
  -U, --user <user>           Bastion username  
  -P, --password <password>   Bastion password (alternative to SSH key)
  -p, --path <path>           Remote MCP server path
  -s, --ssh-key <keyfile>     SSH private key file path
  -k, --kubeconfig <config>   Remote kubeconfig file path
  -e, --env <environment>     Node environment (default: production)
  -h, --help                  Show this help message

Environment Variables (used as defaults):
  MCP_BASTION_HOST            Bastion host address
  MCP_BASTION_USER            Bastion username
  MCP_BASTION_PASSWORD        Bastion password
  MCP_REMOTE_PATH             Remote MCP server path
  MCP_SSH_KEY                 SSH private key file path
  MCP_REMOTE_KUBECONFIG       Remote kubeconfig file path
  MCP_REMOTE_NODE_ENV         Node environment

Examples:
  # Using CLI arguments only
  simple-remote-launcher.js -H bastion.example.com -U root -s ~/.ssh/id_rsa -k /path/to/kubeconfig -p /opt/mcp-server

  # Using environment variables (backward compatible)
  MCP_BASTION_HOST=bastion.example.com simple-remote-launcher.js

  # Mixed: CLI args override env vars
  export MCP_BASTION_HOST=bastion.example.com
  simple-remote-launcher.js -U admin -k /custom/kubeconfig
  `);
}

// Quick validation (no logging to avoid MCP interference)
function validateConfig(config) {
  const required = ['bastionHost', 'bastionUser', 'remotePath', 'remoteKubeconfig'];
  const missing = required.filter(key => !config[key] || config[key] === 'bastion.example.com');
  
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
    const config = parseArguments();
    // Quick validation only
    validateConfig(config);
    
    // Build SSH command based on auth method
    const sshArgs = config.bastionPassword ? [
      'sshpass', '-p', config.bastionPassword, 'ssh',
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ServerAliveInterval=60',
      '-o', 'ServerAliveCountMax=3',
      '-o', 'LogLevel=ERROR',  // Suppress SSH noise
      `${config.bastionUser}@${config.bastionHost}`,
      `cd '${config.remotePath}' && MCP_REMOTE_KUBECONFIG='${config.remoteKubeconfig}' RUNNING_ON_BASTION=true NODE_ENV='${config.remoteNodeEnv}' exec node index.js`
    ] : [
      'ssh',
      '-i', config.sshKey,
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ServerAliveInterval=60', 
      '-o', 'ServerAliveCountMax=3',
      '-o', 'LogLevel=ERROR',  // Suppress SSH noise
      `${config.bastionUser}@${config.bastionHost}`,
      `cd '${config.remotePath}' && MCP_REMOTE_KUBECONFIG='${config.remoteKubeconfig}' RUNNING_ON_BASTION=true NODE_ENV='${config.remoteNodeEnv}' exec node index.js`
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
