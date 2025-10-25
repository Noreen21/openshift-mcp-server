#!/usr/bin/env node
/**
 * OpenShift MCP Server
 * 
 * This code was developed with the assistance of Cursor, an AI-powered code editor.
 * Cursor provides intelligent code completion, error detection, and development assistance.
 * Learn more at: https://cursor.sh
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as k8s from '@kubernetes/client-node';
import { exec } from 'child_process';
import { promisify } from 'util';
// Using built-in fetch available in Node.js 18+

/**
 * OpenShift/Kubernetes MCP Server for cluster monitoring
 */
class OpenShiftMCPServer {
  constructor() {
    // Constants
    this.PENDING_POD_TIMEOUT = 5 * 60 * 1000; // 5 minutes
    this.DEFAULT_RESTART_THRESHOLD = 5;
    this.DEFAULT_CPU_THRESHOLD = 80;
    this.DEFAULT_MEMORY_THRESHOLD = 85;

    // Initialize server
    this.server = new Server(
      {
        name: "openshift_mcp_server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    try {
      // Initialize Kubernetes client
      this.initializeKubernetesClient();
      this.setupToolHandlers();
      this.setupGracefulShutdown();
    } catch (error) {
      console.error('Failed to initialize OpenShift MCP Server:', error);
      throw new Error(`Initialization failed: ${error.message}`);
    }
  }

  initializeKubernetesClient() {
    const kc = new k8s.KubeConfig();
    
    try {
      // Enhanced loading for private clusters
      if (process.env.MCP_REMOTE_KUBECONFIG) {
        console.error(`Loading kubeconfig from MCP_REMOTE_KUBECONFIG: ${process.env.MCP_REMOTE_KUBECONFIG}`);
        kc.loadFromFile(process.env.MCP_REMOTE_KUBECONFIG);
      } else if (process.env.KUBECONFIG) {
        console.error(`Loading kubeconfig from KUBECONFIG: ${process.env.KUBECONFIG}`);
        kc.loadFromFile(process.env.KUBECONFIG);
      } else if (process.env.KUBERNETES_SERVICE_HOST) {
        // Running inside cluster (in-cluster config)
        console.error('Loading in-cluster configuration');
        kc.loadFromCluster();
      } else {
        // Default locations
        console.error('Loading kubeconfig from default location');
        kc.loadFromDefault();
      }

      // Configure for private clusters with proxies
      if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
        console.error('Proxy configuration detected');
        // The k8s client should automatically use proxy settings from env vars
      }

      // Log cluster endpoint for debugging private cluster connectivity
      const currentContext = kc.getCurrentContext();
      if (currentContext) {
        const cluster = kc.getCurrentCluster();
        console.error(`Connected to cluster: ${cluster?.server || 'unknown'}`);
        console.error(`Using context: ${currentContext}`);
      }

      // CRITICAL FIX: Use correct API client creation
      this.k8sApi = kc.makeApiClient(k8s.CoreV1Api);
      // CRITICAL FIX: Remove k8s.Metrics and use kubeconfig for raw requests
      this.kubeConfig = kc;
      this.appsApi = kc.makeApiClient(k8s.AppsV1Api);
      
      console.error('Kubernetes clients initialized successfully');
      
      // Test connectivity to private cluster
      this.testClusterConnectivity();
    } catch (error) {
      console.error('Failed to initialize Kubernetes clients:', error);
      console.error('For private clusters, ensure:');
      console.error('  1. Valid kubeconfig with correct cluster endpoint');
      console.error('  2. Network connectivity to cluster API server');
      console.error('  3. Proper proxy configuration if needed');
      console.error('  4. VPN connection if required');
      throw error;
    }
  }

  async testClusterConnectivity() {
    try {
      // Quick connectivity test
      await this.k8sApi.listNamespace();
      console.error('Cluster connectivity test: SUCCESS');
    } catch (error) {
      console.warn('Cluster connectivity test failed:', error.message);
      console.warn('This may be normal for private clusters with restricted access');
    }
  }

  setupGracefulShutdown() {
    const cleanup = () => {
      console.error('Shutting down OpenShift MCP Server...');
      process.exit(0);
    };
    
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "check_cluster_health",
            description: "Check overall OpenShift cluster health and identify stability issues",
            inputSchema: {
              type: "object",
              properties: {
                detailed: {
                  type: "boolean",
                  description: "Include detailed analysis of each component",
                  default: false
                }
              }
            }
          },
          {
            name: "get_performance_metrics",
            description: "Retrieve current performance metrics for nodes and pods",
            inputSchema: {
              type: "object",
              properties: {
                namespace: {
                  type: "string",
                  description: "Specific namespace to monitor (optional)"
                },
                timeRange: {
                  type: "string",
                  description: "Time range for metrics (e.g., '1h', '24h')",
                  default: "1h"
                }
              }
            }
          },
          {
            name: "detect_resource_issues",
            description: "Detect pods and nodes with resource allocation or utilization issues",
            inputSchema: {
              type: "object",
              properties: {
                thresholds: {
                  type: "object",
                  properties: {
                    cpu: { type: "number", default: 80 },
                    memory: { type: "number", default: 85 },
                    restarts: { type: "number", default: 5 }
                  }
                }
              }
            }
          },
          {
            name: "analyze_pod_disruptions",
            description: "Analyze pod disruptions and restart patterns",
            inputSchema: {
              type: "object",
              properties: {
                namespace: {
                  type: "string",
                  description: "Namespace to analyze (optional)"
                },
                hours: {
                  type: "number",
                  description: "Number of hours to look back",
                  default: 24
                }
              }
            }
          },
          {
            name: "check_node_conditions",
            description: "Check node conditions and identify nodes with issues",
            inputSchema: {
              type: "object",
              properties: {}
            }
          },
          {
            name: "monitor_deployments",
            description: "Monitor deployment status and rollout health",
            inputSchema: {
              type: "object",
              properties: {
                namespace: {
                  type: "string",
                  description: "Namespace to monitor (optional)"
                }
              }
            }
          },
          {
            name: "check_kubelet_status",
            description: "Check kubelet service status and recent logs for errors",
            inputSchema: {
              type: "object",
              properties: {
                hoursBack: {
                  type: "number",
                  description: "Number of hours to look back for logs",
                  default: 24
                },
                includeSystemErrors: {
                  type: "boolean",
                  description: "Include system-level errors in analysis",
                  default: false
                }
              }
            }
          },
          {
            name: "check_crio_status",
            description: "Check CRI-O container runtime status and recent logs",
            inputSchema: {
              type: "object",
              properties: {
                hoursBack: {
                  type: "number",
                  description: "Number of hours to look back for logs",
                  default: 24
                },
                includeContainerErrors: {
                  type: "boolean",
                  description: "Include container-level errors in analysis",
                  default: true
                }
              }
            }
          },
                     {
             name: "analyze_journalctl_pod_errors",
             description: "Analyze journalctl logs for specific pod-related errors and system issues",
             inputSchema: {
               type: "object",
               properties: {
                 pod: {
                   type: "string",
                   description: "Specific pod name to analyze (optional)"
                 },
                hoursBack: {
                  type: "number",
                  description: "Number of hours to look back for logs",
                  default: 24
                },
                service: {
                  type: "string",
                  description: "Specific service to analyze (e.g., kubelet, crio, optional)"
                },
                errorTypes: {
                  type: "array",
                  description: "Types of errors to look for (e.g., ['error', 'fail', 'warn'])",
                  items: { type: "string" },
                  default: ["error", "fail", "warn"]
                }
              }
            }
          },
          // Deployment Tools
          {
            name: "create_deployment",
            description: "Create a new deployment with specified configuration",
            inputSchema: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "Deployment name"
                },
                namespace: {
                  type: "string",
                  description: "Target namespace",
                  default: "default"
                },
                image: {
                  type: "string",
                  description: "Container image"
                },
                replicas: {
                  type: "number",
                  description: "Number of replicas",
                  default: 1
                },
                resources: {
                  type: "object",
                  properties: {
                    cpuRequest: { type: "string", default: "100m" },
                    memoryRequest: { type: "string", default: "128Mi" },
                    cpuLimit: { type: "string", default: "500m" },
                    memoryLimit: { type: "string", default: "512Mi" }
                  }
                },
                ports: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      containerPort: { type: "number" },
                      protocol: { type: "string", default: "TCP" }
                    },
                    required: ["containerPort"]
                  }
                }
              },
              required: ["name", "image"]
            }
          },
          {
            name: "deploy_database",
            description: "Deploy a database with persistent storage",
            inputSchema: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: ["postgresql", "mysql", "mongodb", "redis"],
                  description: "Database type"
                },
                name: {
                  type: "string",
                  description: "Database instance name"
                },
                namespace: {
                  type: "string",
                  description: "Target namespace",
                  default: "default"
                },
                storageSize: {
                  type: "string",
                  description: "Storage size for persistent volume",
                  default: "10Gi"
                },
                resources: {
                  type: "object",
                  properties: {
                    cpuRequest: { type: "string", default: "250m" },
                    memoryRequest: { type: "string", default: "512Mi" },
                    cpuLimit: { type: "string", default: "1000m" },
                    memoryLimit: { type: "string", default: "1Gi" }
                  }
                }
              },
              required: ["type", "name"]
            }
          },
          {
            name: "create_hpa",
            description: "Set up a horizontal pod autoscaler for an application",
            inputSchema: {
              type: "object",
              properties: {
                targetDeployment: {
                  type: "string",
                  description: "Target deployment name"
                },
                namespace: {
                  type: "string",
                  description: "Target namespace",
                  default: "default"
                },
                minReplicas: {
                  type: "number",
                  description: "Minimum number of replicas",
                  default: 1
                },
                maxReplicas: {
                  type: "number",
                  description: "Maximum number of replicas",
                  default: 10
                },
                cpuTarget: {
                  type: "number",
                  description: "Target CPU utilization percentage",
                  default: 70
                },
                memoryTarget: {
                  type: "number",
                  description: "Target memory utilization percentage",
                  default: 80
                }
              },
              required: ["targetDeployment"]
            }
          },
          {
            name: "create_service",
            description: "Create a service to expose an application",
            inputSchema: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "Service name"
                },
                namespace: {
                  type: "string",
                  description: "Target namespace",
                  default: "default"
                },
                selector: {
                  type: "object",
                  description: "Pod selector labels"
                },
                ports: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      port: { type: "number" },
                      targetPort: { type: "number" },
                      protocol: { type: "string", default: "TCP" }
                    },
                    required: ["port", "targetPort"]
                  }
                },
                type: {
                  type: "string",
                  enum: ["ClusterIP", "NodePort", "LoadBalancer"],
                  default: "ClusterIP"
                }
              },
              required: ["name", "selector", "ports"]
            }
          },
          {
                         name: "create_network_policy",
             description: "Create network policies to secure pod-to-pod communication",
             inputSchema: {
               type: "object",
               properties: {
                 name: {
                   type: "string",
                   description: "Network policy name"
                 },
                 namespace: {
                   type: "string",
                   description: "Target namespace",
                   default: "default"
                 },
                 podSelector: {
                   type: "object",
                   description: "Pod selector for policy target"
                 },
                 ingress: {
                   type: "array",
                   description: "Ingress rules"
                 },
                 egress: {
                   type: "array",
                   description: "Egress rules"
                 }
               },
               required: ["name", "podSelector"]
             }
           },
           // Performance Testing Tools
           {
             name: "run_kube_burner",
             description: "Execute cluster density testing with kube-burner to measure application deployment performance",
             inputSchema: {
               type: "object",
               properties: {
                 testType: {
                   type: "string",
                   enum: ["cluster-density-v2", "node-density", "pvc-density", "crd-scale"],
                   description: "Type of kube-burner test to run",
                   default: "cluster-density-v2"
                 },
                 iterations: {
                   type: "number",
                   description: "Number of test iterations",
                   default: 5,
                   minimum: 1,
                   maximum: 100
                 },
                 namespace: {
                   type: "string",
                   description: "Namespace for test resources",
                   default: "kube-burner-test"
                 },
                 timeout: {
                   type: "string",
                   description: "Test timeout duration",
                   default: "10m"
                 }
               }
             }
           },
           {
             name: "run_storage_benchmark",
             description: "Run storage performance benchmarks using FIO workloads",
             inputSchema: {
               type: "object",
               properties: {
                 testType: {
                   type: "string",
                   enum: ["sequential-read", "sequential-write", "random-read", "random-write", "mixed"],
                   description: "Type of storage test",
                   default: "mixed"
                 },
                 blockSize: {
                   type: "string",
                   description: "I/O block size",
                   default: "4k"
                 },
                 duration: {
                   type: "string",
                   description: "Test duration",
                   default: "60s"
                 },
                 storageClass: {
                   type: "string",
                   description: "Storage class to test (optional)"
                 },
                 volumeSize: {
                   type: "string",
                   description: "Size of test volume",
                   default: "10Gi"
                 }
               }
             }
           },
           {
             name: "run_network_test",
             description: "Test network throughput between pods using iperf3",
             inputSchema: {
               type: "object",
               properties: {
                 testType: {
                   type: "string",
                   enum: ["throughput", "latency", "packet-loss"],
                   description: "Type of network test",
                   default: "throughput"
                 },
                 duration: {
                   type: "string",
                   description: "Test duration",
                   default: "30s"
                 },
                 parallel: {
                   type: "number",
                   description: "Number of parallel streams",
                   default: 1
                 },
                 protocol: {
                   type: "string",
                   enum: ["tcp", "udp"],
                   description: "Network protocol",
                   default: "tcp"
                 },
                 bandwidth: {
                   type: "string",
                   description: "Target bandwidth for UDP tests",
                   default: "1G"
                 }
               }
             }
           },
           {
             name: "run_cpu_stress_test",
             description: "Perform CPU and memory stress testing on worker nodes",
             inputSchema: {
               type: "object",
               properties: {
                 testType: {
                   type: "string",
                   enum: ["cpu", "memory", "combined"],
                   description: "Type of stress test",
                   default: "combined"
                 },
                 duration: {
                   type: "string",
                   description: "Test duration",
                   default: "2m"
                 },
                 cpuCores: {
                   type: "number",
                   description: "Number of CPU cores to stress",
                   default: 2
                 },
                 memorySize: {
                   type: "string",
                   description: "Amount of memory to stress",
                   default: "1G"
                 },
                 nodeSelector: {
                   type: "object",
                   description: "Node selector for targeting specific nodes"
                 }
               }
             }
           },
           {
             name: "run_database_benchmark",
             description: "Execute database performance tests with sysbench or pgbench",
             inputSchema: {
               type: "object",
               properties: {
                 dbType: {
                   type: "string",
                   enum: ["postgresql", "mysql"],
                   description: "Database type to test"
                 },
                 testType: {
                   type: "string",
                   enum: ["oltp_read_write", "oltp_read_only", "oltp_write_only"],
                   description: "Type of database test",
                   default: "oltp_read_write"
                 },
                 threads: {
                   type: "number",
                   description: "Number of test threads",
                   default: 10
                 },
                 duration: {
                   type: "string",
                   description: "Test duration",
                   default: "60s"
                 },
                 tableSize: {
                   type: "number",
                   description: "Number of rows in test tables",
                   default: 100000
                 }
               },
               required: ["dbType"]
             }
           }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Validate arguments
        this.validateToolArguments(name, args);

        switch (name) {
          case "check_cluster_health":
            return await this.checkClusterHealth(args?.detailed || false);
          
          case "get_performance_metrics":
            return await this.getPerformanceMetrics(args?.namespace, args?.timeRange);
          
          case "detect_resource_issues":
            return await this.detectResourceIssues(args?.thresholds);
          
          case "analyze_pod_disruptions":
            return await this.analyzePodDisruptions(args?.namespace, args?.hours);
          
          case "check_node_conditions":
            return await this.checkNodeConditions();
          
          case "monitor_deployments":
            return await this.monitorDeployments(args?.namespace);
          
          case "check_kubelet_status":
            return await this.checkKubeletStatus(args?.hoursBack ?? 24, args?.includeSystemErrors || false);
          
          case "check_crio_status":
            return await this.checkCrioStatus(args?.hoursBack ?? 24, args?.includeContainerErrors !== false);
          
          case "analyze_journalctl_pod_errors":
            return await this.analyzeJournalctlPodErrors(args?.pod, args?.hoursBack || 24, args?.service, args?.errorTypes || ['error', 'fail', 'warn']);
          
          // Deployment Tools
          case "create_deployment":
            return await this.createDeployment(args);
          
          case "deploy_database":
            return await this.deployDatabase(args);
          
          case "create_hpa":
            return await this.createHPA(args);
          
          case "create_service":
            return await this.createService(args);
          
          case "create_network_policy":
            return await this.createNetworkPolicy(args);
          
          // Performance Testing Tools
          case "run_kube_burner":
            return await this.runKubeBurner(args);
          
          case "run_storage_benchmark":
            return await this.runStorageBenchmark(args);
          
          case "run_network_test":
            return await this.runNetworkTest(args);
          
          case "run_cpu_stress_test":
            return await this.runCpuStressTest(args);
          
          case "run_database_benchmark":
            return await this.runDatabaseBenchmark(args);
          
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error executing ${name}: ${error.message + " [DEBUG: Raw error]"}`
            }
          ],
          isError: true
        };
      }
    });
  }

  // CRITICAL FIX: Add input validation
  validateToolArguments(toolName, args) {
    if (!args) return;

    switch (toolName) {
      case 'check_cluster_health':
        if (args.detailed !== undefined && typeof args.detailed !== 'boolean') {
          throw new Error('detailed parameter must be boolean');
        }
        break;
      case 'get_performance_metrics':
        if (args.namespace && typeof args.namespace !== 'string') {
          throw new Error('namespace parameter must be string');
        }
        if (args.timeRange && typeof args.timeRange !== 'string') {
          throw new Error('timeRange parameter must be string');
        }
        break;
      case 'detect_resource_issues':
        if (args.thresholds) {
          if (typeof args.thresholds !== 'object') {
            throw new Error('thresholds parameter must be object');
          }
          const { cpu, memory, restarts } = args.thresholds;
          if (cpu !== undefined && typeof cpu !== 'number') {
            throw new Error('cpu threshold must be number');
          }
          if (memory !== undefined && typeof memory !== 'number') {
            throw new Error('memory threshold must be number');
          }
          if (restarts !== undefined && typeof restarts !== 'number') {
            throw new Error('restarts threshold must be number');
          }
        }
        break;
      case 'analyze_pod_disruptions':
        if (args.namespace && typeof args.namespace !== 'string') {
          throw new Error('namespace parameter must be string');
        }
        if (args.hours !== undefined && typeof args.hours !== 'number') {
          throw new Error('hours parameter must be number');
        }
        break;
      case 'monitor_deployments':
        if (args.namespace && typeof args.namespace !== 'string') {
          throw new Error('namespace parameter must be string');
        }
        break;
      case 'check_kubelet_status':
        if (args.hoursBack !== undefined && typeof args.hoursBack !== 'number') {
          throw new Error('hoursBack parameter must be number');
        }
        if (args.includeSystemErrors !== undefined && typeof args.includeSystemErrors !== 'boolean') {
          throw new Error('includeSystemErrors parameter must be boolean');
        }
        break;
      case 'check_crio_status':
        if (args.hoursBack !== undefined && typeof args.hoursBack !== 'number') {
          throw new Error('hoursBack parameter must be number');
        }
        if (args.includeContainerErrors !== undefined && typeof args.includeContainerErrors !== 'boolean') {
          throw new Error('includeContainerErrors parameter must be boolean');
        }
        break;
      case 'analyze_journalctl_pod_errors':
        if (args.pod !== undefined && typeof args.pod !== 'string') {
          throw new Error('pod parameter must be string');
        }
        if (args.hoursBack !== undefined && typeof args.hoursBack !== 'number') {
          throw new Error('hoursBack parameter must be number');
        }
        if (args.service !== undefined && typeof args.service !== 'string') {
          throw new Error('service parameter must be string');
        }
        if (args.errorTypes !== undefined && !Array.isArray(args.errorTypes)) {
          throw new Error('errorTypes parameter must be array');
        }
        break;
      // Deployment Tools Validation
      case 'create_deployment':
        if (!args.name || typeof args.name !== 'string') {
          throw new Error('name parameter is required and must be string');
        }
        if (!args.image || typeof args.image !== 'string') {
          throw new Error('image parameter is required and must be string');
        }
        if (args.namespace && typeof args.namespace !== 'string') {
          throw new Error('namespace parameter must be string');
        }
        if (args.replicas !== undefined && typeof args.replicas !== 'number') {
          throw new Error('replicas parameter must be number');
        }
        break;
      case 'deploy_database':
        if (!args.type || typeof args.type !== 'string') {
          throw new Error('type parameter is required and must be string');
        }
        if (!args.name || typeof args.name !== 'string') {
          throw new Error('name parameter is required and must be string');
        }
        break;
      case 'create_hpa':
        if (!args.targetDeployment || typeof args.targetDeployment !== 'string') {
          throw new Error('targetDeployment parameter is required and must be string');
        }
        break;
      case 'create_service':
        if (!args.name || typeof args.name !== 'string') {
          throw new Error('name parameter is required and must be string');
        }
        if (!args.selector || typeof args.selector !== 'object') {
          throw new Error('selector parameter is required and must be object');
        }
        if (!args.ports || !Array.isArray(args.ports)) {
          throw new Error('ports parameter is required and must be array');
        }
        break;
      case 'create_network_policy':
        if (!args.name || typeof args.name !== 'string') {
          throw new Error('name parameter is required and must be string');
        }
        if (!args.podSelector || typeof args.podSelector !== 'object') {
          throw new Error('podSelector parameter is required and must be object');
        }
        break;
      // Performance Testing Tools Validation
      case 'run_kube_burner':
        if (args.testType && !['cluster-density-v2', 'node-density', 'pvc-density', 'crd-scale'].includes(args.testType)) {
          throw new Error('testType must be one of: cluster-density-v2, node-density, pvc-density, crd-scale');
        }
        if (args.iterations !== undefined && (typeof args.iterations !== 'number' || args.iterations < 1 || args.iterations > 100)) {
          throw new Error('iterations must be number between 1 and 100');
        }
        break;
      case 'run_storage_benchmark':
        if (args.testType && !['sequential-read', 'sequential-write', 'random-read', 'random-write', 'mixed'].includes(args.testType)) {
          throw new Error('testType must be one of: sequential-read, sequential-write, random-read, random-write, mixed');
        }
        break;
      case 'run_network_test':
        if (args.testType && !['throughput', 'latency', 'packet-loss'].includes(args.testType)) {
          throw new Error('testType must be one of: throughput, latency, packet-loss');
        }
        if (args.protocol && !['tcp', 'udp'].includes(args.protocol)) {
          throw new Error('protocol must be tcp or udp');
        }
        break;
      case 'run_cpu_stress_test':
        if (args.testType && !['cpu', 'memory', 'combined'].includes(args.testType)) {
          throw new Error('testType must be one of: cpu, memory, combined');
        }
        break;
      case 'run_database_benchmark':
        if (!args.dbType || !['postgresql', 'mysql'].includes(args.dbType)) {
          throw new Error('dbType is required and must be postgresql or mysql');
        }
        break;
    }
  }

  // CRITICAL FIX: Sanitize error messages
  sanitizeErrorMessage(message) {
    // Remove potentially sensitive information
    return message
      .replace(/token[^,\s]*/gi, 'token[REDACTED]')
      .replace(/password[^,\s]*/gi, 'password[REDACTED]')
      .replace(/secret[^,\s]*/gi, 'secret[REDACTED]');
  }

  async checkClusterHealth(detailed = false) {
    const issues = [];
    const health = {
      overall: 'healthy',
      issues,
      metrics: {
        nodeHealth: 0,
        podHealth: 0,
        resourceUtilization: { cpu: 0, memory: 0 }
      }
    };

    try {
      // CRITICAL FIX: Use Promise.all for parallel API calls
      const [nodesResponse, podsResponse] = await Promise.all([
        this.k8sApi.listNode(),
        this.k8sApi.listPodForAllNamespaces()
      ]);
      
      // Add null checks to prevent undefined errors - fix for correct response structure
      if (!nodesResponse || !nodesResponse.items) {
        throw new Error('Failed to retrieve nodes from cluster');
      }
      if (!podsResponse || !podsResponse.items) {
        throw new Error('Failed to retrieve pods from cluster');
      }
      
      const nodes = nodesResponse.items;
      const pods = podsResponse.items;
      let healthyNodes = 0;

      // Check nodes
      for (const node of nodes) {
        const conditions = node.status?.conditions || [];
        const readyCondition = conditions.find(c => c.type === 'Ready');
        
        if (readyCondition?.status === 'True') {
          healthyNodes++;
        } else {
          issues.push(`Node ${node.metadata?.name} is not ready`);
        }

        // Check for node conditions indicating issues
        const problemConditions = conditions.filter(c => 
          c.type !== 'Ready' && c.status === 'True'
        );
        
        for (const condition of problemConditions) {
          issues.push(`Node ${node.metadata?.name}: ${condition.type} - ${condition.message}`);
        }
      }

      health.metrics.nodeHealth = nodes.length > 0 ? (healthyNodes / nodes.length) * 100 : 0;

      // Check pods
      let healthyPods = 0;
      for (const pod of pods) {
        const phase = pod.status?.phase;
        if (phase === 'Running' || phase === 'Succeeded') {
          healthyPods++;
        } else if (phase === 'Failed' || phase === 'Pending') {
          const age = this.calculateAge(pod.metadata?.creationTimestamp);
          if (phase === 'Pending' && age > this.PENDING_POD_TIMEOUT) {
            issues.push(`Pod ${pod.metadata?.name} in ${pod.metadata?.namespace} stuck in Pending state`);
          } else if (phase === 'Failed') {
            issues.push(`Pod ${pod.metadata?.name} in ${pod.metadata?.namespace} in Failed state`);
          }
        }

        // Check for excessive restarts
        const containerStatuses = pod.status?.containerStatuses || [];
        for (const container of containerStatuses) {
          if (container.restartCount > this.DEFAULT_RESTART_THRESHOLD) {
            issues.push(`Container ${container.name} in pod ${pod.metadata?.name} has ${container.restartCount} restarts`);
          }
        }
      }

      health.metrics.podHealth = pods.length > 0 ? (healthyPods / pods.length) * 100 : 0;

      // Determine overall health
      if (issues.length === 0) {
        health.overall = 'healthy';
      } else if (issues.length <= 3 && health.metrics.nodeHealth > 90 && health.metrics.podHealth > 95) {
        health.overall = 'warning';
      } else {
        health.overall = 'critical';
      }

      const summary = {
        status: health.overall,
        totalNodes: nodes.length,
        healthyNodes,
        totalPods: pods.length,
        healthyPods,
        issuesFound: issues.length,
        ...(detailed && { detailedIssues: issues })
      };

      return {
        content: [
          {
            type: "text",
            text: `Cluster Health Report:\n${JSON.stringify(summary, null, 2)}`
          }
        ]
      };

    } catch (error) {
      throw new Error(`Failed to check cluster health: ${error.message}`);
    }
  }

  async getPerformanceMetrics(namespace, timeRange = '1h') {
    try {
      const metrics = {
        timestamp: new Date().toISOString(),
        nodes: [],
        pods: []
      };

      // Get node metrics using kubectl which we know works
      try {
        const execAsync = promisify(exec);
        
        // CRITICAL FIX: Use KUBECONFIG instead of MCP_REMOTE_KUBECONFIG for kubectl
        const kubeconfigPath = process.env.MCP_REMOTE_KUBECONFIG || process.env.KUBECONFIG;
        
        // Get node metrics using kubectl top nodes which we verified works
        const nodeMetricsResult = await execAsync('kubectl top nodes --no-headers', {
          env: { 
            ...process.env, 
            KUBECONFIG: kubeconfigPath
          }
        });
        
        if (nodeMetricsResult.stdout) {
          const nodeLines = nodeMetricsResult.stdout.trim().split('\n');
          for (const line of nodeLines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 5) {
              const [name, cpu, cpuPercent, memory, memoryPercent] = parts;
              
              // CRITICAL FIX: Ensure node name is not null or undefined
              if (name && name.trim()) {
                try {
                  // Get node status
                  const nodeInfo = await this.k8sApi.readNode(name.trim());
                  metrics.nodes.push({
                    name: name,
                    cpu: this.parseResourceValue(cpu),
                    memory: this.parseResourceValue(memory),
                    cpuPercent: cpuPercent,
                    memoryPercent: memoryPercent,
                    status: nodeInfo.status?.conditions?.find(c => c.type === 'Ready')?.status || 'Unknown'
                  });
                } catch (nodeError) {
                  console.warn(`Could not read node ${name}:`, nodeError.message);
                  metrics.nodes.push({
                    name: name,
                    cpu: this.parseResourceValue(cpu),
                    memory: this.parseResourceValue(memory),
                    cpuPercent: cpuPercent,
                    memoryPercent: memoryPercent,
                    status: 'Unknown'
                  });
                }
              }
            }
          }
        }
      } catch (error) {
        console.warn('Could not retrieve node metrics via kubectl:', error.message);
        metrics.nodes.push({ error: 'Metrics unavailable - check metrics-server deployment' });
      }

      // Get pod metrics using kubectl which we know works
      try {
        const execAsync = promisify(exec);
        
        // CRITICAL FIX: Use KUBECONFIG instead of MCP_REMOTE_KUBECONFIG for kubectl
        const kubeconfigPath = process.env.MCP_REMOTE_KUBECONFIG || process.env.KUBECONFIG;
        
        const kubectlCmd = namespace 
          ? `kubectl top pods -n ${namespace} --no-headers`
          : 'kubectl top pods --all-namespaces --no-headers';
        
        const podMetricsResult = await execAsync(kubectlCmd, {
          env: { 
            ...process.env, 
            KUBECONFIG: kubeconfigPath
          }
        });
        
        if (podMetricsResult.stdout) {
          const podLines = podMetricsResult.stdout.trim().split('\n');
          const podsResponse = namespace 
            ? await this.k8sApi.listNamespacedPod(namespace)
            : await this.k8sApi.listPodForAllNamespaces();
          
          const pods = podsResponse.items;

          for (const line of podLines) {
            if (line.trim()) {
              const parts = line.trim().split(/\s+/);
              let podNamespace, podName, cpu, memory;
              
              if (namespace) {
                // Format: NAME CPU(cores) MEMORY(bytes)
                [podName, cpu, memory] = parts;
                podNamespace = namespace;
              } else {
                // Format: NAMESPACE NAME CPU(cores) MEMORY(bytes)
                [podNamespace, podName, cpu, memory] = parts;
              }
              
              if (podName && cpu && memory) {
                const pod = pods.find(p => 
                  p.metadata?.name === podName && 
                  p.metadata?.namespace === podNamespace
                );

                if (pod) {
                  const restarts = pod.status?.containerStatuses?.reduce((sum, c) => sum + c.restartCount, 0) || 0;

                  metrics.pods.push({
                    name: podName,
                    namespace: podNamespace,
                    cpu: this.parseResourceValue(cpu),
                    memory: this.parseResourceValue(memory),
                    restarts,
                    age: this.formatAge(pod.metadata?.creationTimestamp)
                  });
                }
              }
            }
          }
        }
      } catch (error) {
        console.warn('Could not retrieve pod metrics via kubectl:', error.message);
        metrics.pods.push({ error: 'Pod metrics unavailable - check metrics-server deployment' });
      }

      return {
        content: [
          {
            type: "text",
            text: `Performance Metrics Report:\n${JSON.stringify(metrics, null, 2)}`
          }
        ]
      };

    } catch (error) {
      throw new Error(`Failed to get performance metrics: ${error.message}`);
    }
  }

  async detectResourceIssues(thresholds = {}) {
    const defaultThresholds = {
      cpu: this.DEFAULT_CPU_THRESHOLD,
      memory: this.DEFAULT_MEMORY_THRESHOLD,
      restarts: this.DEFAULT_RESTART_THRESHOLD
    };
    const finalThresholds = { ...defaultThresholds, ...thresholds };

    try {
      const issues = {
        highCpuPods: [],
        highMemoryPods: [],
        frequentRestartPods: [],
        resourceQuotaIssues: []
      };

      // Check pods for resource issues
      const podsResponse = await this.k8sApi.listPodForAllNamespaces();
      const pods = podsResponse.items;

      for (const pod of pods) {
        // Check restart count
        const containerStatuses = pod.status?.containerStatuses || [];
        const totalRestarts = containerStatuses.reduce((sum, c) => sum + c.restartCount, 0);
        
        if (totalRestarts >= finalThresholds.restarts) {
          issues.frequentRestartPods.push({
            name: pod.metadata?.name,
            namespace: pod.metadata?.namespace,
            restarts: totalRestarts,
            containers: containerStatuses.map(c => ({
              name: c.name,
              restarts: c.restartCount,
              reason: c.lastState?.terminated?.reason
            }))
          });
        }

        // Check resource requests vs limits
        const containers = pod.spec?.containers || [];
        for (const container of containers) {
          const resources = container.resources;
          if (resources?.requests && resources?.limits) {
            const cpuRequest = this.parseResourceValue(resources.requests.cpu || '0');
            const cpuLimit = this.parseResourceValue(resources.limits.cpu || '0');
            const memRequest = this.parseResourceValue(resources.requests.memory || '0');
            const memLimit = this.parseResourceValue(resources.limits.memory || '0');

            if (cpuLimit > 0 && (cpuRequest / cpuLimit) * 100 > finalThresholds.cpu) {
              issues.highCpuPods.push({
                pod: pod.metadata?.name,
                namespace: pod.metadata?.namespace,
                container: container.name,
                cpuRequestPercent: (cpuRequest / cpuLimit) * 100
              });
            }

            if (memLimit > 0 && (memRequest / memLimit) * 100 > finalThresholds.memory) {
              issues.highMemoryPods.push({
                pod: pod.metadata?.name,
                namespace: pod.metadata?.namespace,
                container: container.name,
                memoryRequestPercent: (memRequest / memLimit) * 100
              });
            }
          }
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Resource Issues Report:\n${JSON.stringify(issues, null, 2)}`
          }
        ]
      };

    } catch (error) {
      throw new Error(`Failed to detect resource issues: ${error.message}`);
    }
  }

  async analyzePodDisruptions(namespace, hours = 24) {
    try {
      const disruptions = {
        recentRestarts: [],
        evictions: [],
        oomKills: [],
        summary: {
          totalRestarts: 0,
          totalEvictions: 0,
          totalOOMKills: 0
        }
      };

      const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
      
      // Get events to analyze disruptions
      const eventsResponse = namespace 
        ? await this.k8sApi.listNamespacedEvent(namespace)
        : await this.k8sApi.listEventForAllNamespaces();
      
      const events = eventsResponse.items;

      for (const event of events) {
        const eventTime = new Date(event.firstTimestamp || event.eventTime);
        if (eventTime < cutoffTime) continue;

        if (event.reason === 'Killing' || event.reason === 'Evicted') {
          disruptions.evictions.push({
            pod: event.involvedObject.name,
            namespace: event.involvedObject.namespace,
            reason: event.reason,
            message: event.message,
            time: eventTime.toISOString()
          });
          disruptions.summary.totalEvictions++;
        }

        if (event.reason === 'OOMKilling') {
          disruptions.oomKills.push({
            pod: event.involvedObject.name,
            namespace: event.involvedObject.namespace,
            message: event.message,
            time: eventTime.toISOString()
          });
          disruptions.summary.totalOOMKills++;
        }

        if (event.reason === 'Started' && event.message?.includes('Started container')) {
          disruptions.recentRestarts.push({
            pod: event.involvedObject.name,
            namespace: event.involvedObject.namespace,
            container: this.extractContainerName(event.message),
            time: eventTime.toISOString()
          });
          disruptions.summary.totalRestarts++;
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Pod Disruption Analysis (last ${hours}h):\n${JSON.stringify(disruptions, null, 2)}`
          }
        ]
      };

    } catch (error) {
      throw new Error(`Failed to analyze pod disruptions: ${error.message}`);
    }
  }

  async checkNodeConditions() {
    try {
      const nodeIssues = [];
      const nodesResponse = await this.k8sApi.listNode();
      
      // Add null check to prevent undefined errors - fix for correct response structure
      if (!nodesResponse || !nodesResponse.items) {
        throw new Error('Failed to retrieve nodes from cluster');
      }
      
      const nodes = nodesResponse.items;

      for (const node of nodes) {
        const conditions = node.status?.conditions || [];
        const nodeInfo = {
          name: node.metadata?.name,
          conditions: [],
          taints: node.spec?.taints || [],
          allocatable: node.status?.allocatable,
          capacity: node.status?.capacity
        };

        for (const condition of conditions) {
          if (condition.type === 'Ready' && condition.status !== 'True') {
            nodeInfo.conditions.push({
              type: condition.type,
              status: condition.status,
              reason: condition.reason,
              message: condition.message,
              severity: 'critical'
            });
          } else if (condition.type !== 'Ready' && condition.status === 'True') {
            nodeInfo.conditions.push({
              type: condition.type,
              status: condition.status,
              reason: condition.reason,
              message: condition.message,
              severity: this.getConditionSeverity(condition.type)
            });
          }
        }

        if (nodeInfo.conditions.length > 0 || nodeInfo.taints.length > 0) {
          nodeIssues.push(nodeInfo);
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Node Conditions Report:\n${JSON.stringify({ 
              totalNodes: nodes.length,
              nodesWithIssues: nodeIssues.length,
              details: nodeIssues 
            }, null, 2)}`
          }
        ]
      };

    } catch (error) {
      throw new Error(`Failed to check node conditions: ${error.message}`);
    }
  }

  async monitorDeployments(namespace) {
    try {
      const deploymentIssues = [];
      
      // WORKAROUND: Use kubectl directly due to client library namespace parameter bug
      const promisifiedExec = promisify(exec);
      const useRemoteAccess = process.env.MCP_REMOTE_KUBECONFIG || process.env.MCP_BASTION_HOST;
      
      let kubectlCmd;
      if (useRemoteAccess) {
        const sshHost = process.env.MCP_BASTION_HOST || 'localhost';
        const sshKey = process.env.MCP_SSH_KEY || '~/.ssh/id_rsa';
        const sshUser = process.env.MCP_BASTION_USER || 'root';
        const kubeconfig = process.env.MCP_REMOTE_KUBECONFIG || '/root/.kube/config';
        
        if (namespace) {
          kubectlCmd = `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${sshUser}@${sshHost} "KUBECONFIG=${kubeconfig} kubectl get deployments -n ${namespace} -o json"`;
        } else {
          kubectlCmd = `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${sshUser}@${sshHost} "KUBECONFIG=${kubeconfig} kubectl get deployments --all-namespaces -o json"`;
        }
      } else {
        if (namespace) {
          kubectlCmd = `kubectl get deployments -n ${namespace} -o json`;
        } else {
          kubectlCmd = `kubectl get deployments --all-namespaces -o json`;
        }
      }
      
      const result = await promisifiedExec(kubectlCmd, { maxBuffer: 1024 * 1024 * 10 }); // 10MB buffer for large deployment lists
      const deploymentsResponse = JSON.parse(result.stdout);
      
      if (!deploymentsResponse || !deploymentsResponse.items) {
        throw new Error('Failed to retrieve deployments from cluster');
      }
      
      const deployments = deploymentsResponse.items;

      for (const deployment of deployments) {
        const status = deployment.status;
        const spec = deployment.spec;
        
        const deploymentInfo = {
          name: deployment.metadata?.name,
          namespace: deployment.metadata?.namespace,
          replicas: {
            desired: spec?.replicas || 0,
            ready: status?.readyReplicas || 0,
            available: status?.availableReplicas || 0,
            updated: status?.updatedReplicas || 0
          },
          conditions: status?.conditions || [],
          issues: []
        };

        // Check for deployment issues
        if (deploymentInfo.replicas.ready < deploymentInfo.replicas.desired) {
          deploymentInfo.issues.push(`Only ${deploymentInfo.replicas.ready}/${deploymentInfo.replicas.desired} replicas ready`);
        }

        if (deploymentInfo.replicas.available < deploymentInfo.replicas.desired) {
          deploymentInfo.issues.push(`Only ${deploymentInfo.replicas.available}/${deploymentInfo.replicas.desired} replicas available`);
        }

        const failedConditions = deploymentInfo.conditions.filter(c => c.status === 'False');
        for (const condition of failedConditions) {
          deploymentInfo.issues.push(`${condition.type}: ${condition.message}`);
        }

        if (deploymentInfo.issues.length > 0) {
          deploymentIssues.push(deploymentInfo);
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Deployment Monitor Report:\n${JSON.stringify({
              totalDeployments: deployments.length,
              deploymentsWithIssues: deploymentIssues.length,
              details: deploymentIssues
            }, null, 2)}`
          }
        ]
      };

    } catch (error) {
      throw new Error(`Failed to monitor deployments: ${error.message}`);
    }
  }

  async analyzeJournalctlPodErrors(pod, hoursBack = 24, service, errorTypes = ['error', 'fail', 'warn']) {
    try {
      // Ensure hoursBack has a default value to prevent undefined errors
      hoursBack = hoursBack || 24;
      errorTypes = errorTypes || ['error', 'fail', 'warn'];
      // Check if we have access to the node via oc debug
      const nodes = await this.k8sApi.listNode();
      if (!nodes || !nodes.items || nodes.items.length === 0) {
        throw new Error('No nodes found in cluster');
      }
      
      const nodeName = nodes.items[0].metadata.name;
      const promisifiedExec = promisify(exec);
      
      // Build the journalctl command based on parameters
      let journalCommand = `journalctl --since '${hoursBack} hours ago'`;
      
      if (service) {
        journalCommand += ` -u ${service}`;
      }
      
      // Add error type filters
      const errorFilter = errorTypes.map(type => `${type}\\|`).join('').slice(0, -2); // Remove trailing \|
      journalCommand += ` | grep -i '${errorFilter}'`;
      
      // If specific pod is requested, filter for that pod
      if (pod) {
        journalCommand += ` | grep -i '${pod}'`;
      }
      
      journalCommand += ' | tail -50'; // Limit output
      
      // Determine if we need remote access (SSH to bastion) or direct access
      const needsRemoteAccess = process.env.MCP_BASTION_HOST && 
                                 process.env.MCP_BASTION_HOST !== 'localhost' &&
                                 !process.env.RUNNING_ON_BASTION;
      let fullCommand;
      
      if (needsRemoteAccess) {
        // Remote access: SSH to bastion host, then oc debug
        const sshHost = process.env.MCP_BASTION_HOST;
        const sshKey = process.env.MCP_SSH_KEY || '/home/nchhabra/.ssh/id_rsa';
        const sshUser = process.env.MCP_BASTION_USER || 'root';
        const kubeconfigPath = process.env.MCP_REMOTE_KUBECONFIG || process.env.KUBECONFIG;
        
        fullCommand = `ssh -i ${sshKey} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR ${sshUser}@${sshHost} "cd /opt/openshift-mcp-server && KUBECONFIG=${kubeconfigPath} timeout 60s oc debug node/${nodeName} -- chroot /host bash -c \\"${journalCommand.replace(/"/g, '\\"')}\\""`; 
      } else {
        // Direct access: MCP server has direct cluster access OR running on bastion
        const kubeconfigPath = process.env.MCP_REMOTE_KUBECONFIG || process.env.KUBECONFIG || '/root/.kube/config';
        fullCommand = `cd /opt/openshift-mcp-server && KUBECONFIG=${kubeconfigPath} timeout 60s oc debug node/${nodeName} -- chroot /host bash -c "${journalCommand}"`;
      }

      
      console.error(`Executing journalctl analysis: ${fullCommand}`);
      
      // Execute the command
      const result = await promisifiedExec(fullCommand, { 
        timeout: 90000, // 90 second timeout for oc debug node access (takes time to create debug pod)
        maxBuffer: 1024 * 1024 * 5, // 5MB buffer for large log outputs,
        env: {
          ...process.env,
          KUBECONFIG: process.env.MCP_REMOTE_KUBECONFIG || process.env.KUBECONFIG
        }
      });
      
      const logOutput = result.stdout.trim();
      
      // Parse and analyze the logs
      const analysis = this.parseJournalctlLogs(logOutput, pod, service, errorTypes, hoursBack);
      
      return {
        content: [
          {
            type: "text",
            text: `Journalctl Pod Error Analysis:\n${JSON.stringify(analysis, null, 2)}`
          }
        ]
      };
      
    } catch (error) {
      console.error('Error analyzing journalctl logs:', error);
      return {
        content: [
          {
            type: "text",
            text: `Error analyzing journalctl logs: ${error.message + " [DEBUG: Raw error]"}`
          }
        ],
        isError: true
      };
    }
  }
  
  parseJournalctlLogs(logOutput, pod, service, errorTypes, hoursBack = 24) {
    const lines = logOutput.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      return {
        summary: 'No errors found in the specified time range',
        totalErrors: 0,
        pod: pod || 'all',
        service: service || 'all',
        timeRange: 'last 24 hours',
        errors: []
      };
    }
    
    const errors = [];
    const errorCounts = {};
    
    for (const line of lines) {
      // Skip debug pod creation/removal messages
      if (line.includes('Starting pod/') || line.includes('Removing debug pod')) {
        continue;
      }
      
      // Extract timestamp, service, and error details
      const timestampMatch = line.match(/^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})/);
      const timestamp = timestampMatch ? timestampMatch[1] : 'unknown';
      
      // Determine error type
      let errorType = 'unknown';
      for (const type of errorTypes) {
        if (line.toLowerCase().includes(type.toLowerCase())) {
          errorType = type;
          break;
        }
      }
      
      // Extract service name
      let serviceName = service || 'unknown';
      if (line.includes('kubelet')) serviceName = 'kubelet';
      if (line.includes('crio')) serviceName = 'crio';
      if (line.includes('systemd')) serviceName = 'systemd';
      
      // Extract pod name if present
      let podName = pod || null;
      const podMatch = line.match(/pod[/\s]+"?([^"\s]+)"?/i);
      if (podMatch && podMatch[1]) {
        podName = podMatch[1];
      }
      
      // Categorize common error types
      let category = 'general';
      if (line.includes('ContainerStatus from runtime service failed')) {
        category = 'container_cleanup';
      } else if (line.includes('DeleteContainer returned error')) {
        category = 'container_deletion';
      } else if (line.includes('Failed to process watch event')) {
        category = 'cadvisor_watch';
      } else if (line.includes('container with ID') && line.includes('not found')) {
        category = 'container_not_found';
      } else if (line.includes('OutOfDisk') || line.includes('MemoryPressure') || line.includes('DiskPressure')) {
        category = 'resource_pressure';
      }
      
      const errorEntry = {
        timestamp,
        errorType,
        service: serviceName,
        pod: podName,
        category,
        message: line.substring(line.indexOf(serviceName) + serviceName.length).trim() || line,
        severity: this.getErrorSeverity(category, line)
      };
      
      errors.push(errorEntry);
      
      // Count error types
      const key = `${category}_${errorType}`;
      errorCounts[key] = (errorCounts[key] || 0) + 1;
    }
    
    // Sort errors by severity and timestamp
    errors.sort((a, b) => {
      if (a.severity !== b.severity) {
        const severityOrder = { 'critical': 3, 'warning': 2, 'info': 1 };
        return severityOrder[b.severity] - severityOrder[a.severity];
      }
      return b.timestamp.localeCompare(a.timestamp);
    });
    
    return {
      summary: this.generateErrorSummary(errors, errorCounts),
      totalErrors: errors.length,
      pod: pod || 'all',
      service: service || 'all',
      timeRange: `last ${hoursBack || 24} hours`,
      errorCounts,
      errors: errors.slice(0, 20), // Limit to top 20 errors
      analysis: this.analyzeErrorPatterns(errors)
    };
  }
  
  getErrorSeverity(category, message) {
    const criticalPatterns = [
      'OutOfDisk', 'MemoryPressure', 'DiskPressure', 'resource_pressure',
      'failed to start', 'panic', 'fatal', 'oom', 'killed'
    ];
    
    const warningPatterns = [
      'container_cleanup', 'container_deletion', 'cadvisor_watch',
      'container_not_found', 'DeleteContainer', 'ContainerStatus'
    ];
    
    for (const pattern of criticalPatterns) {
      if (category.includes(pattern) || message.toLowerCase().includes(pattern.toLowerCase())) {
        return 'critical';
      }
    }
    
    for (const pattern of warningPatterns) {
      if (category.includes(pattern) || message.toLowerCase().includes(pattern.toLowerCase())) {
        return 'warning';
      }
    }
    
    return 'info';
  }
  
  generateErrorSummary(errors, errorCounts) {
    if (errors.length === 0) {
      return 'No errors found';
    }
    
    const criticalCount = errors.filter(e => e.severity === 'critical').length;
    const warningCount = errors.filter(e => e.severity === 'warning').length;
    const infoCount = errors.filter(e => e.severity === 'info').length;
    
    const topCategory = Object.entries(errorCounts)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'unknown';
    
    return `Found ${errors.length} errors: ${criticalCount} critical, ${warningCount} warnings, ${infoCount} info. Most common: ${topCategory}`;
  }
  
  analyzeErrorPatterns(errors) {
    const patterns = {
      containerCleanupRaceConditions: 0,
      resourcePressureIssues: 0,
      podStartupFailures: 0,
      networkIssues: 0,
      storageIssues: 0
    };
    
    for (const error of errors) {
      if (error.category === 'container_cleanup' || error.category === 'container_deletion') {
        patterns.containerCleanupRaceConditions++;
      } else if (error.category === 'resource_pressure') {
        patterns.resourcePressureIssues++;
      } else if (error.message.includes('failed to start') || error.message.includes('startup')) {
        patterns.podStartupFailures++;
      } else if (error.message.includes('network') || error.message.includes('dns')) {
        patterns.networkIssues++;
      } else if (error.message.includes('disk') || error.message.includes('volume')) {
        patterns.storageIssues++;
      }
    }
    
    return {
      patterns,
      recommendations: this.generateRecommendations(patterns)
    };
  }
  
  generateRecommendations(patterns) {
    const recommendations = [];
    
    if (patterns.containerCleanupRaceConditions > 10) {
      recommendations.push("High number of container cleanup race conditions detected. This is typically normal but monitor for performance impact.");
    }
    
    if (patterns.resourcePressureIssues > 0) {
      recommendations.push("Resource pressure detected. Consider reviewing node resource allocation and pod resource requests/limits.");
    }
    
    if (patterns.podStartupFailures > 5) {
      recommendations.push("Multiple pod startup failures detected. Check pod specifications and resource availability.");
    }
    
    if (patterns.networkIssues > 0) {
      recommendations.push("Network-related errors detected. Review network configuration and connectivity.");
    }
    
    if (patterns.storageIssues > 0) {
      recommendations.push("Storage-related errors detected. Check persistent volume claims and storage capacity.");
    }
    
    if (recommendations.length === 0) {
      recommendations.push("No significant issues detected. System appears to be operating normally.");
    }
    
    return recommendations;
  }

  async checkKubeletStatus(hoursBack = 24, includeSystemErrors = false) {
    try {
      const promisifiedExec = promisify(exec);
      
      // Get all cluster nodes first
      const kubeconfigPath = process.env.MCP_REMOTE_KUBECONFIG || process.env.KUBECONFIG || '/root/.kube/config';
      const needsRemoteAccess = process.env.MCP_BASTION_HOST && 
                                 process.env.MCP_BASTION_HOST !== 'localhost' &&
                                 !process.env.RUNNING_ON_BASTION;
      
      let getNodesCmd;
      if (needsRemoteAccess) {
        const sshHost = process.env.MCP_BASTION_HOST;
        const sshKey = process.env.MCP_SSH_KEY || '/home/nchhabra/.ssh/id_rsa';
        const sshUser = process.env.MCP_BASTION_USER || 'root';
        getNodesCmd = `ssh -i ${sshKey} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR ${sshUser}@${sshHost} "cd /opt/openshift-mcp-server && KUBECONFIG=${kubeconfigPath} kubectl get nodes -o json"`;
      } else {
        getNodesCmd = `cd /opt/openshift-mcp-server && KUBECONFIG=${kubeconfigPath} kubectl get nodes -o json`;
      }
      
      const nodesResult = await promisifiedExec(getNodesCmd, { maxBuffer: 1024 * 1024 * 5, timeout: 30000 });
      const nodes = JSON.parse(nodesResult.stdout);
      
      if (!nodes.items || nodes.items.length === 0) {
        throw new Error('No nodes found in cluster');
      }
      
      let allKubeletStatus = {};
      let allKubeletLogs = [];
      let allSystemErrors = [];
      
      // Check kubelet on each node
      for (const node of nodes.items) {
        const nodeName = node.metadata.name;
        
        try {
          // Check kubelet status on this node
          const statusCommand = 'systemctl is-active kubelet.service 2>/dev/null || echo "inactive"';
          let statusFullCommand;
          
          if (needsRemoteAccess) {
            const sshHost = process.env.MCP_BASTION_HOST;
            const sshKey = process.env.MCP_SSH_KEY || '/home/nchhabra/.ssh/id_rsa';
            const sshUser = process.env.MCP_BASTION_USER || 'root';
            statusFullCommand = `ssh -i ${sshKey} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR ${sshUser}@${sshHost} "cd /opt/openshift-mcp-server && KUBECONFIG=${kubeconfigPath} timeout 90s oc debug node/${nodeName} -- chroot /host bash -c \\"${statusCommand.replace(/"/g, '\\"')}\\""`; 
          } else {
            statusFullCommand = `cd /opt/openshift-mcp-server && KUBECONFIG=${kubeconfigPath} timeout 90s oc debug node/${nodeName} -- chroot /host bash -c "${statusCommand}"`;
          }
          
          const statusResult = await promisifiedExec(statusFullCommand, { 
            maxBuffer: 1024 * 1024 * 5, 
            timeout: 120000  // 2 minutes for oc debug pod creation
          });
          allKubeletStatus[nodeName] = statusResult.stdout.trim();
          
          // Get kubelet logs from this node
          const logsCommand = `journalctl -u kubelet.service --since="-${hoursBack}h" --lines=50 --no-pager`;
          let logsFullCommand;
          
          if (needsRemoteAccess) {
            const sshHost = process.env.MCP_BASTION_HOST;
            const sshKey = process.env.MCP_SSH_KEY || '/home/nchhabra/.ssh/id_rsa';
            const sshUser = process.env.MCP_BASTION_USER || 'root';
            logsFullCommand = `ssh -i ${sshKey} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR ${sshUser}@${sshHost} "cd /opt/openshift-mcp-server && KUBECONFIG=${kubeconfigPath} timeout 90s oc debug node/${nodeName} -- chroot /host bash -c \\"${logsCommand.replace(/"/g, '\\"')}\\""`; 
          } else {
            logsFullCommand = `cd /opt/openshift-mcp-server && KUBECONFIG=${kubeconfigPath} timeout 90s oc debug node/${nodeName} -- chroot /host bash -c "${logsCommand}"`;
          }
          
          const logsResult = await promisifiedExec(logsFullCommand, { 
            maxBuffer: 1024 * 1024 * 5, 
            timeout: 120000  // 2 minutes for oc debug pod creation
          });
          
          const logLines = logsResult.stdout.split('\n').filter(line => line.trim());
          
          // Parse logs for errors and warnings
          for (const line of logLines) {
            if (line.toLowerCase().includes('error') || 
                line.toLowerCase().includes('failed') ||
                line.toLowerCase().includes('warn')) {
              allKubeletLogs.push({
                node: nodeName,
                timestamp: line.match(/^\w+ \d+ \d+:\d+:\d+/) ? line.match(/^\w+ \d+ \d+:\d+:\d+/)[0] : 'unknown',
                level: line.toLowerCase().includes('error') || line.toLowerCase().includes('failed') ? 'error' : 'warning',
                message: line
              });
            }
          }
          
          // If system errors are requested, check for broader system issues on this node
          if (includeSystemErrors) {
            const systemCommand = `journalctl --since="-${hoursBack}h" --lines=20 --no-pager | grep -i 'systemd\\|kernel\\|oom'`;
            let systemFullCommand;
            
            if (needsRemoteAccess) {
              const sshHost = process.env.MCP_BASTION_HOST;
              const sshKey = process.env.MCP_SSH_KEY || '/home/nchhabra/.ssh/id_rsa';
              const sshUser = process.env.MCP_BASTION_USER || 'root';
              systemFullCommand = `ssh -i ${sshKey} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR ${sshUser}@${sshHost} "cd /opt/openshift-mcp-server && KUBECONFIG=${kubeconfigPath} timeout 90s oc debug node/${nodeName} -- chroot /host bash -c \\"${systemCommand.replace(/"/g, '\\"')}\\""`; 
            } else {
              systemFullCommand = `cd /opt/openshift-mcp-server && KUBECONFIG=${kubeconfigPath} timeout 90s oc debug node/${nodeName} -- chroot /host bash -c "${systemCommand}"`;
            }
            
            try {
              const systemResult = await promisifiedExec(systemFullCommand, { 
                maxBuffer: 1024 * 1024 * 5, 
                timeout: 120000
              });
              const systemLines = systemResult.stdout.split('\n').filter(line => line.trim());
              for (const line of systemLines) {
                allSystemErrors.push({
                  node: nodeName,
                  message: line
                });
              }
            } catch (systemError) {
              console.error(`Could not retrieve system errors from node ${nodeName}:`, systemError.message);
            }
          }
          
        } catch (nodeError) {
          allKubeletStatus[nodeName] = 'inaccessible';
          allKubeletLogs.push({
            node: nodeName,
            timestamp: new Date().toISOString(),
            level: 'error',
            message: `Cannot access kubelet service on node ${nodeName}: ${nodeError.message}`
          });
        }
      }
      
      return {
        content: [
          {
            type: "text",
            text: `Kubelet Status Report:\n${JSON.stringify({
              nodesChecked: nodes.items.length,
              status: allKubeletStatus,
              logsAnalyzed: allKubeletLogs.length,
              systemErrors: includeSystemErrors ? allSystemErrors.length : 'not_requested',
              recentIssues: allKubeletLogs.slice(0, 10),
              systemIssues: includeSystemErrors ? allSystemErrors.slice(0, 5) : []
            }, null, 2)}`
          }
        ]
      };
      
    } catch (error) {
      throw new Error(`Failed to check kubelet status: ${error.message}`);
    }
  }

  async checkCrioStatus(hoursBack = 24, includeContainerErrors = true) {
    try {
      const promisifiedExec = promisify(exec);
      
      // Get all cluster nodes first
      const kubeconfigPath = process.env.MCP_REMOTE_KUBECONFIG || process.env.KUBECONFIG || '/root/.kube/config';
      const needsRemoteAccess = process.env.MCP_BASTION_HOST && 
                                 process.env.MCP_BASTION_HOST !== 'localhost' &&
                                 !process.env.RUNNING_ON_BASTION;
      
      let getNodesCmd;
      if (needsRemoteAccess) {
        const sshHost = process.env.MCP_BASTION_HOST;
        const sshKey = process.env.MCP_SSH_KEY || '/home/nchhabra/.ssh/id_rsa';
        const sshUser = process.env.MCP_BASTION_USER || 'root';
        getNodesCmd = `ssh -i ${sshKey} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR ${sshUser}@${sshHost} "cd /opt/openshift-mcp-server && KUBECONFIG=${kubeconfigPath} kubectl get nodes -o json"`;
      } else {
        getNodesCmd = `cd /opt/openshift-mcp-server && KUBECONFIG=${kubeconfigPath} kubectl get nodes -o json`;
      }
      
      const nodesResult = await promisifiedExec(getNodesCmd, { maxBuffer: 1024 * 1024 * 5, timeout: 30000 });
      const nodes = JSON.parse(nodesResult.stdout);
      
      if (!nodes.items || nodes.items.length === 0) {
        throw new Error('No nodes found in cluster');
      }
      
      let allCrioStatus = {};
      let allCrioLogs = [];
      let allContainerErrors = [];
      
      // Check CRI-O on each node
      for (const node of nodes.items) {
        const nodeName = node.metadata.name;
        
        try {
          // Check CRI-O status on this node
          const statusCommand = 'systemctl is-active crio.service 2>/dev/null || echo "inactive"';
          let statusFullCommand;
          
          if (needsRemoteAccess) {
            const sshHost = process.env.MCP_BASTION_HOST;
            const sshKey = process.env.MCP_SSH_KEY || '/home/nchhabra/.ssh/id_rsa';
            const sshUser = process.env.MCP_BASTION_USER || 'root';
            statusFullCommand = `ssh -i ${sshKey} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR ${sshUser}@${sshHost} "cd /opt/openshift-mcp-server && KUBECONFIG=${kubeconfigPath} timeout 90s oc debug node/${nodeName} -- chroot /host bash -c \\"${statusCommand.replace(/"/g, '\\"')}\\""`; 
          } else {
            statusFullCommand = `cd /opt/openshift-mcp-server && KUBECONFIG=${kubeconfigPath} timeout 90s oc debug node/${nodeName} -- chroot /host bash -c "${statusCommand}"`;
          }
          
          const statusResult = await promisifiedExec(statusFullCommand, { 
            maxBuffer: 1024 * 1024 * 5, 
            timeout: 120000  // 2 minutes for oc debug pod creation
          });
          allCrioStatus[nodeName] = statusResult.stdout.trim();
          
          // Get CRI-O logs from this node
          const logsCommand = `journalctl -u crio.service --since="-${hoursBack}h" --lines=50 --no-pager`;
          let logsFullCommand;
          
          if (needsRemoteAccess) {
            const sshHost = process.env.MCP_BASTION_HOST;
            const sshKey = process.env.MCP_SSH_KEY || '/home/nchhabra/.ssh/id_rsa';
            const sshUser = process.env.MCP_BASTION_USER || 'root';
            logsFullCommand = `ssh -i ${sshKey} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR ${sshUser}@${sshHost} "cd /opt/openshift-mcp-server && KUBECONFIG=${kubeconfigPath} timeout 90s oc debug node/${nodeName} -- chroot /host bash -c \\"${logsCommand.replace(/"/g, '\\"')}\\""`; 
          } else {
            logsFullCommand = `cd /opt/openshift-mcp-server && KUBECONFIG=${kubeconfigPath} timeout 90s oc debug node/${nodeName} -- chroot /host bash -c "${logsCommand}"`;
          }
          
          const logsResult = await promisifiedExec(logsFullCommand, { 
            maxBuffer: 1024 * 1024 * 5, 
            timeout: 120000  // 2 minutes for oc debug pod creation
          });
          
          const logLines = logsResult.stdout.split('\n').filter(line => line.trim());
          
          // Parse logs for errors and warnings
          for (const line of logLines) {
            if (line.toLowerCase().includes('error') || 
                line.toLowerCase().includes('failed') ||
                line.toLowerCase().includes('warn')) {
              allCrioLogs.push({
                node: nodeName,
                timestamp: line.match(/^\w+ \d+ \d+:\d+:\d+/) ? line.match(/^\w+ \d+ \d+:\d+:\d+/)[0] : 'unknown',
                level: line.toLowerCase().includes('error') || line.toLowerCase().includes('failed') ? 'error' : 'warning',
                message: line
              });
            }
          }
          
          // If container errors are requested, check for container-specific issues on this node
          if (includeContainerErrors) {
            const containerCommand = `journalctl --since="-${hoursBack}h" --lines=30 --no-pager | grep -i 'container\\|pod\\|image'`;
            let containerFullCommand;
            
            if (needsRemoteAccess) {
              const sshHost = process.env.MCP_BASTION_HOST;
              const sshKey = process.env.MCP_SSH_KEY || '/home/nchhabra/.ssh/id_rsa';
              const sshUser = process.env.MCP_BASTION_USER || 'root';
              containerFullCommand = `ssh -i ${sshKey} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR ${sshUser}@${sshHost} "cd /opt/openshift-mcp-server && KUBECONFIG=${kubeconfigPath} timeout 90s oc debug node/${nodeName} -- chroot /host bash -c \\"${containerCommand.replace(/"/g, '\\"')}\\""`; 
            } else {
              containerFullCommand = `cd /opt/openshift-mcp-server && KUBECONFIG=${kubeconfigPath} timeout 90s oc debug node/${nodeName} -- chroot /host bash -c "${containerCommand}"`;
            }
            
            try {
              const containerResult = await promisifiedExec(containerFullCommand, { 
                maxBuffer: 1024 * 1024 * 5, 
                timeout: 120000
              });
              const containerLines = containerResult.stdout.split('\n').filter(line => line.trim());
              for (const line of containerLines) {
                if (line.toLowerCase().includes('error') || line.toLowerCase().includes('failed')) {
                  allContainerErrors.push({
                    node: nodeName,
                    message: line
                  });
                }
              }
            } catch (containerError) {
              console.error(`Could not retrieve container errors from node ${nodeName}:`, containerError.message);
            }
          }
          
        } catch (nodeError) {
          allCrioStatus[nodeName] = 'inaccessible';
          allCrioLogs.push({
            node: nodeName,
            timestamp: new Date().toISOString(),
            level: 'error',
            message: `Cannot access CRI-O service on node ${nodeName}: ${nodeError.message}`
          });
        }
      }
      
      return {
        content: [
          {
            type: "text",
            text: `CRI-O Status Report:\n${JSON.stringify({
              nodesChecked: nodes.items.length,
              status: allCrioStatus,
              logsAnalyzed: allCrioLogs.length,
              containerErrors: includeContainerErrors ? allContainerErrors.length : 'not_requested',
              recentIssues: allCrioLogs.slice(0, 10),
              containerIssues: includeContainerErrors ? allContainerErrors.slice(0, 5) : []
            }, null, 2)}`
          }
        ]
      };
      
    } catch (error) {
      throw new Error(`Failed to check CRI-O status: ${error.message}`);
    }
  }

  // ======================
  // DEPLOYMENT TOOLS
  // ======================

  async createDeployment(args) {
    try {
      const { name, namespace: inputNamespace, image, replicas = 1, resources = {}, ports = [] } = args;
      const namespace = inputNamespace || 'default';
      
      const deployment = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name,
          namespace,
          labels: {
            app: name,
            'managed-by': 'openshift-mcp-server'
          }
        },
        spec: {
          replicas,
          selector: {
            matchLabels: {
              app: name
            }
          },
          template: {
            metadata: {
              labels: {
                app: name
              }
            },
            spec: {
              containers: [
                {
                  name,
                  image,
                  ports: ports.map(p => ({
                    containerPort: p.containerPort,
                    protocol: p.protocol || 'TCP'
                  })),
                  resources: {
                    requests: {
                      cpu: resources.cpuRequest || '100m',
                      memory: resources.memoryRequest || '128Mi'
                    },
                    limits: {
                      cpu: resources.cpuLimit || '500m',
                      memory: resources.memoryLimit || '512Mi'
                    }
                  }
                }
              ]
            }
          }
        }
      };

      // Create namespace if it doesn't exist
      try {
        await this.k8sApi.readNamespace(namespace);
      } catch (error) {
        if (error.response?.statusCode === 404) {
          const namespaceObject = {
            metadata: { name: namespace }
          };
          await this.k8sApi.createNamespace(namespaceObject);
        }
      }

      // WORKAROUND: Use kubectl directly due to client library namespace parameter bug
      const deploymentYaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    app: ${name}
    managed-by: openshift-mcp-server
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: ${name}
  template:
    metadata:
      labels:
        app: ${name}
    spec:
      containers:
      - name: ${name}
        image: ${image}
        ports:
${ports.map(port => `        - containerPort: ${port.containerPort}
          protocol: ${port.protocol || 'TCP'}`).join('\n')}
        resources:
          requests:
            cpu: "${resources.cpuRequest || '100m'}"
            memory: "${resources.memoryRequest || '128Mi'}"
          limits:
            cpu: "${resources.cpuLimit || resources.cpuRequest || '100m'}"
            memory: "${resources.memoryLimit || resources.memoryRequest || '128Mi'}"
`;

      const promisifiedExec = promisify(exec);
      const useRemoteAccess = process.env.MCP_REMOTE_KUBECONFIG || process.env.MCP_BASTION_HOST;
      let kubectlCmd;
      
      if (useRemoteAccess) {
        const sshHost = process.env.MCP_BASTION_HOST || 'localhost';
        const sshKey = process.env.MCP_SSH_KEY || '~/.ssh/id_rsa';
        const sshUser = process.env.MCP_BASTION_USER || 'root';
        const kubeconfig = process.env.MCP_REMOTE_KUBECONFIG || '/root/.kube/config';
        kubectlCmd = `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${sshUser}@${sshHost} "echo '${deploymentYaml}' | KUBECONFIG=${kubeconfig} kubectl apply -f -"`;
      } else {
        kubectlCmd = `echo '${deploymentYaml}' | kubectl apply -f -`;
      }

      const kubectlResult = await promisifiedExec(kubectlCmd);
      
      // Mock the result format expected by the rest of the function
      const result = {
        metadata: {
          name: name,
          namespace: namespace
        },
        spec: {
          replicas: replicas,
          template: {
            spec: {
              containers: [
                {
                  image: image
                }
              ]
            }
          }
        }
      };
      
      return {
        content: [
          {
            type: "text",
            text: `Deployment "${name}" created successfully in namespace "${namespace}":\n${JSON.stringify({
              name: result.metadata.name,
              namespace: result.metadata.namespace,
              replicas: result.spec.replicas,
              image: result.spec.template.spec.containers[0].image,
              status: 'Created'
            }, null, 2)}`
          }
        ]
      };

    } catch (error) {
      throw new Error(`Failed to create deployment: ${error.message}`);
    }
  }

  async deployDatabase(args) {
    try {
      const { type, name, namespace: inputNamespace, storageSize = '10Gi', resources = {} } = args;
      const namespace = inputNamespace || 'default';
      
      const dbConfigs = {
        postgresql: {
          image: 'postgres:13',
          port: 5432,
          envVars: [
            { name: 'POSTGRES_DB', value: name },
            { name: 'POSTGRES_USER', value: 'postgres' },
            { name: 'POSTGRES_PASSWORD', value: 'postgres123' }
          ]
        },
        mysql: {
          image: 'mysql:8.0',
          port: 3306,
          envVars: [
            { name: 'MYSQL_DATABASE', value: name },
            { name: 'MYSQL_ROOT_PASSWORD', value: 'mysql123' }
          ]
        },
        mongodb: {
          image: 'mongo:5.0',
          port: 27017,
          envVars: [
            { name: 'MONGO_INITDB_DATABASE', value: name }
          ]
        },
        redis: {
          image: 'redis:6-alpine',
          port: 6379,
          envVars: []
        }
      };

      const config = dbConfigs[type];
      if (!config) {
        throw new Error(`Unsupported database type: ${type}`);
      }

      // Create namespace if it doesn't exist
      try {
        await this.k8sApi.readNamespace(namespace);
      } catch (error) {
        if (error.response?.statusCode === 404) {
          const namespaceObject = {
            metadata: { name: namespace }
          };
          await this.k8sApi.createNamespace(namespaceObject);
        }
      }

      // Create PVC
      const pvc = {
        apiVersion: 'v1',
        kind: 'PersistentVolumeClaim',
        metadata: {
          name: `${name}-storage`,
          namespace
        },
        spec: {
          accessModes: ['ReadWriteOnce'],
          resources: {
            requests: {
              storage: storageSize
            }
          }
        }
      };

      // WORKAROUND: Use kubectl directly due to client library namespace parameter bug
      const pvcYaml = `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ${name}-storage
  namespace: ${namespace}
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: ${storageSize}
`;

      const promisifiedExec = promisify(exec);
      const useRemoteAccess = process.env.MCP_REMOTE_KUBECONFIG || process.env.MCP_BASTION_HOST;
      let kubectlPvcCmd;
      
      if (useRemoteAccess) {
        const sshHost = process.env.MCP_BASTION_HOST || 'localhost';
        const sshKey = process.env.MCP_SSH_KEY || '~/.ssh/id_rsa';
        const sshUser = process.env.MCP_BASTION_USER || 'root';
        const kubeconfig = process.env.MCP_REMOTE_KUBECONFIG || '/root/.kube/config';
        kubectlPvcCmd = `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${sshUser}@${sshHost} "echo '${pvcYaml}' | KUBECONFIG=${kubeconfig} kubectl apply -f -"`;
      } else {
        kubectlPvcCmd = `echo '${pvcYaml}' | kubectl apply -f -`;
      }

      await promisifiedExec(kubectlPvcCmd);

      // Create Deployment
      const deployment = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name,
          namespace,
          labels: {
            app: name,
            'db-type': type,
            'managed-by': 'openshift-mcp-server'
          }
        },
        spec: {
          replicas: 1,
          selector: {
            matchLabels: {
              app: name
            }
          },
          template: {
            metadata: {
              labels: {
                app: name
              }
            },
            spec: {
              containers: [
                {
                  name: type,
                  image: config.image,
                  ports: [
                    {
                      containerPort: config.port,
                      protocol: 'TCP'
                    }
                  ],
                  env: config.envVars,
                  volumeMounts: [
                    {
                      name: 'data',
                      mountPath: type === 'postgresql' ? '/var/lib/postgresql/data' :
                                type === 'mysql' ? '/var/lib/mysql' :
                                type === 'mongodb' ? '/data/db' : '/data'
                    }
                  ],
                  resources: {
                    requests: {
                      cpu: resources.cpuRequest || '250m',
                      memory: resources.memoryRequest || '512Mi'
                    },
                    limits: {
                      cpu: resources.cpuLimit || '1000m',
                      memory: resources.memoryLimit || '1Gi'
                    }
                  }
                }
              ],
              volumes: [
                {
                  name: 'data',
                  persistentVolumeClaim: {
                    claimName: `${name}-storage`
                  }
                }
              ]
            }
          }
        }
      };

      // WORKAROUND: Use kubectl directly due to client library namespace parameter bug  
      const deploymentYaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    app: ${name}
    type: database
    managed-by: openshift-mcp-server
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${name}
  template:
    metadata:
      labels:
        app: ${name}
        type: database
    spec:
      containers:
      - name: ${type}
        image: ${type === 'postgresql' ? 'postgres:latest' : type === 'mysql' ? 'mysql:latest' : type === 'mongodb' ? 'mongo:latest' : 'redis:latest'}
        ports:
        - containerPort: ${type === 'postgresql' ? 5432 : type === 'mysql' ? 3306 : type === 'mongodb' ? 27017 : 6379}
          protocol: TCP
        resources:
          requests:
            cpu: "${resources.cpuRequest || '250m'}"
            memory: "${resources.memoryRequest || '512Mi'}"
          limits:
            cpu: "${resources.cpuLimit || resources.cpuRequest || '1000m'}"
            memory: "${resources.memoryLimit || resources.memoryRequest || '1Gi'}"
        env:
        - name: POSTGRES_DB
          value: "${name}"
        - name: POSTGRES_USER  
          value: "admin"
        - name: POSTGRES_PASSWORD
          value: "password"
        volumeMounts:
        - name: ${name}-storage
          mountPath: /var/lib/postgresql/data
      volumes:
      - name: ${name}-storage
        persistentVolumeClaim:
          claimName: ${name}-pvc
`;

      let kubectlCmd;
      
      if (useRemoteAccess) {
        const sshHost = process.env.MCP_BASTION_HOST || 'localhost';
        const sshKey = process.env.MCP_SSH_KEY || '~/.ssh/id_rsa';
        const sshUser = process.env.MCP_BASTION_USER || 'root';
        const kubeconfig = process.env.MCP_REMOTE_KUBECONFIG || '/root/.kube/config';
        kubectlCmd = `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${sshUser}@${sshHost} "echo '${deploymentYaml}' | KUBECONFIG=${kubeconfig} kubectl apply -f -"`;
      } else {
        kubectlCmd = `echo '${deploymentYaml}' | kubectl apply -f -`;
      }

      const kubectlResult = await promisifiedExec(kubectlCmd);
      
      // Mock the result format expected by the rest of the function
      const deploymentResult = {
        metadata: {
          name: deployment.metadata.name,
          namespace: namespace
        }
      };

      // Create Service
      const service = {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          name,
          namespace
        },
        spec: {
          selector: {
            app: name
          },
          ports: [
            {
              port: config.port,
              targetPort: config.port,
              protocol: 'TCP'
            }
          ]
        }
      };

      // WORKAROUND: Use kubectl directly due to client library namespace parameter bug
      const serviceYaml = `apiVersion: v1
kind: Service
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    app: ${name}
    db-type: ${type}
    managed-by: openshift-mcp-server
spec:
  selector:
    app: ${name}
  ports:
  - port: ${config.port}
    targetPort: ${config.port}
    protocol: TCP
`;

      if (useRemoteAccess) {
        const sshHost = process.env.MCP_BASTION_HOST || 'localhost';
        const sshKey = process.env.MCP_SSH_KEY || '~/.ssh/id_rsa';
        const sshUser = process.env.MCP_BASTION_USER || 'root';
        const kubeconfig = process.env.MCP_REMOTE_KUBECONFIG || '/root/.kube/config';
        kubectlCmd = `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${sshUser}@${sshHost} "echo '${serviceYaml}' | KUBECONFIG=${kubeconfig} kubectl apply -f -"`;
      } else {
        kubectlCmd = `echo '${serviceYaml}' | kubectl apply -f -`;
      }

      await promisifiedExec(kubectlCmd);

      return {
        content: [
          {
            type: "text",
            text: `Database "${name}" (${type}) deployed successfully in namespace "${namespace}":\n${JSON.stringify({
              name: deploymentResult.metadata.name,
              namespace: deploymentResult.metadata.namespace,
              type,
              image: config.image,
              port: config.port,
              storageSize,
              status: 'Deployed'
            }, null, 2)}`
          }
        ]
      };

    } catch (error) {
      throw new Error(`Failed to deploy database: ${error.message}`);
    }
  }

  async createHPA(args) {
    try {
      const { 
        targetDeployment, 
        namespace: inputNamespace, 
        minReplicas = 1, 
        maxReplicas = 10, 
        cpuTarget = 70, 
        memoryTarget = 80 
      } = args;
      const namespace = inputNamespace || 'default';

      // Verify deployment exists
      const promisifiedExec = promisify(exec);
      const useRemoteAccess = process.env.MCP_REMOTE_KUBECONFIG || process.env.MCP_BASTION_HOST;
      
      try {
        let verifyCmd;
        if (useRemoteAccess) {
          const sshHost = process.env.MCP_BASTION_HOST || 'localhost';
          const sshKey = process.env.MCP_SSH_KEY || '~/.ssh/id_rsa';
          const sshUser = process.env.MCP_BASTION_USER || 'root';
          const kubeconfig = process.env.MCP_REMOTE_KUBECONFIG || '/root/.kube/config';
          verifyCmd = `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${sshUser}@${sshHost} "KUBECONFIG=${kubeconfig} kubectl get deployment ${targetDeployment} -n ${namespace}"`;
        } else {
          verifyCmd = `kubectl get deployment ${targetDeployment} -n ${namespace}`;
        }
        await promisifiedExec(verifyCmd);
      } catch (error) {
        throw new Error(`Deployment "${targetDeployment}" not found in namespace "${namespace}"`);
      }

      const hpa = {
        apiVersion: 'autoscaling/v2',
        kind: 'HorizontalPodAutoscaler',
        metadata: {
          name: `${targetDeployment}-hpa`,
          namespace,
          labels: {
            'managed-by': 'openshift-mcp-server'
          }
        },
        spec: {
          scaleTargetRef: {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            name: targetDeployment
          },
          minReplicas,
          maxReplicas,
          metrics: [
            {
              type: 'Resource',
              resource: {
                name: 'cpu',
                target: {
                  type: 'Utilization',
                  averageUtilization: cpuTarget
                }
              }
            },
            {
              type: 'Resource',
              resource: {
                name: 'memory',
                target: {
                  type: 'Utilization',
                  averageUtilization: memoryTarget
                }
              }
            }
          ]
        }
      };

      // WORKAROUND: Use kubectl directly due to client library namespace parameter bug
      const hpaYaml = `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ${targetDeployment}-hpa
  namespace: ${namespace}
  labels:
    managed-by: openshift-mcp-server
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ${targetDeployment}
  minReplicas: ${minReplicas}
  maxReplicas: ${maxReplicas}
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: ${cpuTarget}
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: ${memoryTarget}
`;

      let kubectlCmd;
      
      if (useRemoteAccess) {
        const sshHost = process.env.MCP_BASTION_HOST || 'localhost';
        const sshKey = process.env.MCP_SSH_KEY || '~/.ssh/id_rsa';
        const sshUser = process.env.MCP_BASTION_USER || 'root';
        const kubeconfig = process.env.MCP_REMOTE_KUBECONFIG || '/root/.kube/config';
        kubectlCmd = `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${sshUser}@${sshHost} "echo '${hpaYaml}' | KUBECONFIG=${kubeconfig} kubectl apply -f -"`;
      } else {
        kubectlCmd = `echo '${hpaYaml}' | kubectl apply -f -`;
      }

      try {
        const kubectlResult = await promisifiedExec(kubectlCmd);
        
        // Mock the result format expected by the rest of the function
        const result = {
          metadata: { name: `${targetDeployment}-hpa`, namespace: namespace }
        };
        
        return {
          content: [
            {
              type: "text",
              text: `HPA "${targetDeployment}-hpa" created successfully for deployment "${targetDeployment}":\n${JSON.stringify({
                name: result.metadata.name,
                namespace: result.metadata.namespace,
                targetDeployment,
                minReplicas,
                maxReplicas,
                cpuTarget: `${cpuTarget}%`,
                memoryTarget: `${memoryTarget}%`,
                status: 'Created'
              }, null, 2)}`
            }
          ]
        };
      } catch (error) {
        throw new Error(`Failed to create HPA (check if metrics-server is installed): ${error.message}`);
      }

    } catch (error) {
      throw new Error(`Failed to create HPA: ${error.message}`);
    }
  }

  async createService(args) {
    try {
      const { name, namespace: inputNamespace, selector, ports, type = 'ClusterIP' } = args;
      const namespace = inputNamespace || 'default';

      const service = {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          name,
          namespace,
          labels: {
            'managed-by': 'openshift-mcp-server'
          }
        },
        spec: {
          selector,
          ports: ports.map(p => ({
            port: p.port,
            targetPort: p.targetPort,
            protocol: p.protocol || 'TCP'
          })),
          type
        }
      };

      // Create namespace if it doesn't exist
      try {
        await this.k8sApi.readNamespace(namespace);
      } catch (error) {
        if (error.response?.statusCode === 404) {
          const namespaceObject = {
            metadata: { name: namespace }
          };
          await this.k8sApi.createNamespace(namespaceObject);
        }
      }

      // WORKAROUND: Use kubectl directly due to client library namespace parameter bug
      const serviceYaml = `apiVersion: v1
kind: Service
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    managed-by: openshift-mcp-server
spec:
  selector:
${Object.entries(selector).map(([k, v]) => `    ${k}: ${v}`).join('\n')}
  ports:
${ports.map(p => `  - port: ${p.port}
    targetPort: ${p.targetPort}
    protocol: ${p.protocol || 'TCP'}`).join('\n')}
  type: ${type}
`;

      const promisifiedExec = promisify(exec);
      const useRemoteAccess = process.env.MCP_REMOTE_KUBECONFIG || process.env.MCP_BASTION_HOST;
      let kubectlCmd;
      
      if (useRemoteAccess) {
        const sshHost = process.env.MCP_BASTION_HOST || 'localhost';
        const sshKey = process.env.MCP_SSH_KEY || '~/.ssh/id_rsa';
        const sshUser = process.env.MCP_BASTION_USER || 'root';
        const kubeconfig = process.env.MCP_REMOTE_KUBECONFIG || '/root/.kube/config';
        kubectlCmd = `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${sshUser}@${sshHost} "echo '${serviceYaml}' | KUBECONFIG=${kubeconfig} kubectl apply -f -"`;
      } else {
        kubectlCmd = `echo '${serviceYaml}' | kubectl apply -f -`;
      }

      const kubectlResult = await promisifiedExec(kubectlCmd);
      
      // Mock the result format expected by the rest of the function
      const result = {
        metadata: { name: name, namespace: namespace },
        spec: { type: type, ports: ports, selector: selector }
      };
      
      return {
        content: [
          {
            type: "text",
            text: `Service "${name}" created successfully in namespace "${namespace}":\n${JSON.stringify({
              name: result.metadata.name,
              namespace: result.metadata.namespace,
              type: result.spec.type,
              ports: result.spec.ports,
              selector: result.spec.selector,
              status: 'Created'
            }, null, 2)}`
          }
        ]
      };

    } catch (error) {
      throw new Error(`Failed to create service: ${error.message}`);
    }
  }

  async createNetworkPolicy(args) {
    try {
      const { name, namespace: inputNamespace, podSelector, ingress = [], egress = [] } = args;
      const namespace = inputNamespace || 'default';

      const networkPolicy = {
        apiVersion: 'networking.k8s.io/v1',
        kind: 'NetworkPolicy',
        metadata: {
          name,
          namespace,
          labels: {
            'managed-by': 'openshift-mcp-server'
          }
        },
        spec: {
          podSelector,
          policyTypes: []
        }
      };

      if (ingress.length > 0) {
        networkPolicy.spec.policyTypes.push('Ingress');
        networkPolicy.spec.ingress = ingress;
      }

      if (egress.length > 0) {
        networkPolicy.spec.policyTypes.push('Egress');
        networkPolicy.spec.egress = egress;
      }

      // If no rules specified, create a default deny-all policy
      if (ingress.length === 0 && egress.length === 0) {
        networkPolicy.spec.policyTypes = ['Ingress', 'Egress'];
        networkPolicy.spec.ingress = [];
        networkPolicy.spec.egress = [];
      }

      // Create namespace if it doesn't exist
      try {
        await this.k8sApi.readNamespace(namespace);
      } catch (error) {
        if (error.response?.statusCode === 404) {
          const namespaceObject = {
            metadata: { name: namespace }
          };
          await this.k8sApi.createNamespace(namespaceObject);
        }
      }

      // WORKAROUND: Use kubectl directly due to client library namespace parameter bug
      const networkPolicyYaml = `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    managed-by: openshift-mcp-server
spec:
  podSelector:
${Object.entries(podSelector).map(([k, v]) => `    ${k}: ${v}`).join('\n')}
  policyTypes:
${networkPolicy.spec.policyTypes.map(type => `  - ${type}`).join('\n')}
${networkPolicy.spec.ingress ? `  ingress:
${JSON.stringify(networkPolicy.spec.ingress, null, 2).split('\n').map(line => `  ${line}`).join('\n')}` : ''}
${networkPolicy.spec.egress ? `  egress:
${JSON.stringify(networkPolicy.spec.egress, null, 2).split('\n').map(line => `  ${line}`).join('\n')}` : ''}
`;

      const promisifiedExec = promisify(exec);
      const useRemoteAccess = process.env.MCP_REMOTE_KUBECONFIG || process.env.MCP_BASTION_HOST;
      let kubectlCmd;
      
      if (useRemoteAccess) {
        const sshHost = process.env.MCP_BASTION_HOST || 'localhost';
        const sshKey = process.env.MCP_SSH_KEY || '~/.ssh/id_rsa';
        const sshUser = process.env.MCP_BASTION_USER || 'root';
        const kubeconfig = process.env.MCP_REMOTE_KUBECONFIG || '/root/.kube/config';
        kubectlCmd = `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${sshUser}@${sshHost} "echo '${networkPolicyYaml}' | KUBECONFIG=${kubeconfig} kubectl apply -f -"`;
      } else {
        kubectlCmd = `echo '${networkPolicyYaml}' | kubectl apply -f -`;
      }

      const kubectlResult = await promisifiedExec(kubectlCmd);
      
      // Mock the result format expected by the rest of the function
      const result = {
        metadata: { name: name, namespace: namespace },
        spec: { 
          podSelector: podSelector, 
          policyTypes: networkPolicy.spec.policyTypes 
        }
      };
      
      return {
        content: [
          {
            type: "text",
            text: `Network Policy "${name}" created successfully in namespace "${namespace}":\n${JSON.stringify({
              name: result.metadata.name,
              namespace: result.metadata.namespace,
              podSelector: result.spec.podSelector,
              policyTypes: result.spec.policyTypes,
              status: 'Created'
            }, null, 2)}`
          }
        ]
      };

    } catch (error) {
      throw new Error(`Failed to create network policy: ${error.message}`);
    }
  }

  // ======================
  // PERFORMANCE TESTING TOOLS
  // ======================

  async runKubeBurner(args) {
    try {
      const { 
        testType = 'cluster-density-v2', 
        iterations = 5, 
        namespace = 'kube-burner-test', 
        timeout = '10m',
        cleanup = true,
        operation = 'create' // 'create', 'cleanup', or 'both'
      } = args;
      
      const kubeconfigPath = process.env.MCP_REMOTE_KUBECONFIG || process.env.KUBECONFIG;
      const execAsync = promisify(exec);
      
      // Validate operation type
      if (!['create', 'cleanup', 'both'].includes(operation)) {
        throw new Error('operation must be one of: create, cleanup, both');
      }
      
      let results = {
        testType,
        iterations,
        namespace,
        timeout,
        operation,
        status: 'Started'
      };

      // CLEANUP OPERATION
      if (operation === 'cleanup' || operation === 'both') {
        console.error(`Starting cleanup of namespace: ${namespace}`);
        
        try {
          // Check if namespace exists
          await execAsync(`kubectl get namespace ${namespace} --kubeconfig ${kubeconfigPath}`, {
            env: { ...process.env, KUBECONFIG: kubeconfigPath }
          });
          
          // Get pod count before cleanup
          const podCountResult = await execAsync(
            `kubectl get pods -n ${namespace} --no-headers --kubeconfig ${kubeconfigPath} | wc -l`, 
            { env: { ...process.env, KUBECONFIG: kubeconfigPath } }
          );
          const podCount = parseInt(podCountResult.stdout.trim()) || 0;
          
          // Perform cleanup
          const cleanupStart = Date.now();
          await execAsync(`kubectl delete namespace ${namespace} --wait=true --timeout=300s --kubeconfig ${kubeconfigPath}`, {
            env: { ...process.env, KUBECONFIG: kubeconfigPath }
          });
          const cleanupDuration = Date.now() - cleanupStart;
          
          results.cleanup = {
            podsDeleted: podCount,
            duration: `${Math.round(cleanupDuration / 1000)}s`,
            status: 'Completed'
          };
          
          if (operation === 'cleanup') {
            results.status = 'Completed';
            return {
              content: [{
                type: "text",
                text: `Kube-burner cleanup completed:\n${JSON.stringify(results, null, 2)}`
              }]
            };
          }
          
        } catch (error) {
          if (error.stdout?.includes('NotFound') || error.stderr?.includes('not found')) {
            results.cleanup = { status: 'Namespace not found - already clean' };
          } else {
            throw new Error(`Cleanup failed: ${error.message}`);
          }
        }
      }

      // CREATE OPERATION
      if (operation === 'create' || operation === 'both') {
        console.error(`Starting creation for test type: ${testType}`);
        
        // Create namespace
        try {
          await execAsync(`kubectl create namespace ${namespace} --kubeconfig ${kubeconfigPath}`, {
            env: { ...process.env, KUBECONFIG: kubeconfigPath }
          });
        } catch (error) {
          if (!error.stderr?.includes('already exists')) {
            console.error(`Warning: Could not create namespace ${namespace}: ${error.message}`);
          }
        }

        const createStart = Date.now();
        
        if (testType === 'node-density') {
          const podCount = iterations * 10;
          
          // Create pods using YAML manifests
          for (let i = 1; i <= podCount; i++) {
            const podManifest = `apiVersion: v1
kind: Pod
metadata:
  name: density-test-pod-${i}
  namespace: ${namespace}
  labels:
    app: node-density-test
    test-iteration: "${i}"
spec:
  containers:
  - name: pause
    image: registry.k8s.io/pause:3.8
    resources:
      requests:
        memory: "10Mi"
        cpu: "1m"
      limits:
        memory: "20Mi"
        cpu: "10m"
  restartPolicy: Never`;
            
            await execAsync(`echo '${podManifest}' | kubectl apply -f - --kubeconfig ${kubeconfigPath}`, {
              env: { ...process.env, KUBECONFIG: kubeconfigPath }
            });
          }
          
          // Wait for scheduling
          await new Promise(resolve => setTimeout(resolve, 15000));
          
          results.creation = {
            podsCreated: podCount,
            testType: 'node-density',
            duration: `${Math.round((Date.now() - createStart) / 1000)}s`,
            status: 'Completed'
          };
        } else {
          // cluster-density-v2 and other types - use simplified inline creation
          const podCount = iterations * 5;
          
          // Create pods using YAML manifests
          for (let i = 1; i <= podCount; i++) {
            const podManifest = `apiVersion: v1
kind: Pod
metadata:
  name: test-pod-${i}
  namespace: ${namespace}
  labels:
    app: ${testType}-test
    test-iteration: "${i}"
spec:
  containers:
  - name: pause
    image: registry.k8s.io/pause:3.8
    resources:
      requests:
        memory: "10Mi"
        cpu: "1m"
      limits:
        memory: "20Mi"
        cpu: "10m"
  restartPolicy: Never`;
            
            await execAsync(`echo '${podManifest}' | kubectl apply -f - --kubeconfig ${kubeconfigPath}`, {
              env: { ...process.env, KUBECONFIG: kubeconfigPath }
            });
          }
          
          // Wait for scheduling
          await new Promise(resolve => setTimeout(resolve, 15000));
          
          results.creation = {
            podsCreated: podCount,
            testType: testType,
            duration: `${Math.round((Date.now() - createStart) / 1000)}s`,
            status: 'Completed'
          };
        }

        // Optionally cleanup after creation (for backward compatibility)
        if (cleanup && operation === 'create') {
          console.error('Performing automatic cleanup...');
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s to observe pods
          
          try {
            await execAsync(`kubectl delete namespace ${namespace} --wait=true --timeout=300s --kubeconfig ${kubeconfigPath}`, {
              env: { ...process.env, KUBECONFIG: kubeconfigPath }
            });
            results.cleanup = { status: 'Automatic cleanup completed' };
          } catch (error) {
            results.cleanup = { status: `Cleanup failed: ${error.message}` };
          }
        }
      }

      results.status = 'Completed';
      
      return {
        content: [{
          type: "text",
          text: `Kube-burner ${operation} operation completed:\n${JSON.stringify(results, null, 2)}`
        }]
      };

    } catch (error) {
      throw new Error(`Failed to run kube-burner operation: ${error.message}`);
    }
  }

  async createNodeDensityPods(namespace, podCount, kubeconfigPath, execAsync) {
    console.error(`Creating ${podCount} node-density pods...`);
    
    // Create pods using YAML manifests to avoid kubectl run syntax issues
    for (let i = 1; i <= podCount; i++) {
      const podManifest = `apiVersion: v1
kind: Pod
metadata:
  name: density-test-pod-${i}
  namespace: ${namespace}
  labels:
    app: node-density-test
    test-iteration: "${i}"
spec:
  containers:
  - name: pause
    image: registry.k8s.io/pause:3.8
    resources:
      requests:
        memory: "10Mi"
        cpu: "1m"
      limits:
        memory: "20Mi"
        cpu: "10m"
  restartPolicy: Never`;
      
      await execAsync(`echo '${podManifest}' | kubectl apply -f - --kubeconfig ${kubeconfigPath}`, {
        env: { ...process.env, KUBECONFIG: kubeconfigPath }
      });
    }
    
    // Wait for scheduling
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    // Get final status
    const statusResult = await execAsync(
      `kubectl get pods -n ${namespace} -o wide --no-headers --kubeconfig ${kubeconfigPath} | awk '{print $7}' | sort | uniq -c`,
      { env: { ...process.env, KUBECONFIG: kubeconfigPath } }
    );
    
    console.error(`Node distribution: ${statusResult.stdout.trim()}`);
  }

  async createClusterDensityPods(namespace, podCount, kubeconfigPath, execAsync) {
    console.error(`Creating ${podCount} cluster-density pods...`);
    
    // Create pods using YAML manifests to avoid kubectl run syntax issues
    for (let i = 1; i <= podCount; i++) {
      const podManifest = `apiVersion: v1
kind: Pod
metadata:
  name: test-pod-${i}
  namespace: ${namespace}
  labels:
    app: cluster-density-test
    test-iteration: "${i}"
spec:
  containers:
  - name: pause
    image: registry.k8s.io/pause:3.8
    resources:
      requests:
        memory: "10Mi"
        cpu: "1m"
      limits:
        memory: "20Mi"
        cpu: "10m"
  restartPolicy: Never`;
      
      await execAsync(`echo '${podManifest}' | kubectl apply -f - --kubeconfig ${kubeconfigPath}`, {
        env: { ...process.env, KUBECONFIG: kubeconfigPath }
      });
    }
    
    // Wait for scheduling
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    // Get final status
    const statusResult = await execAsync(
      `kubectl get pods -n ${namespace} --no-headers --kubeconfig ${kubeconfigPath} | awk '{print $3}' | sort | uniq -c`,
      { env: { ...process.env, KUBECONFIG: kubeconfigPath } }
    );
    
    console.error(`Pod status distribution: ${statusResult.stdout.trim()}`);
  }

  async runStorageBenchmark(args) {
    try {
      const { 
        testType = 'mixed', 
        blockSize = '4k', 
        duration = '60s', 
        storageClass, 
        volumeSize = '10Gi' 
      } = args;

      const testNamespace = 'storage-benchmark';
      
      // Create test namespace
      try {
        await this.k8sApi.readNamespace({name: testNamespace});
      } catch (error) {
        if (error.code === 404 || error.response?.statusCode === 404) {
          const namespaceObject = {
            metadata: { name: testNamespace }
          };
          await this.k8sApi.createNamespace({body: namespaceObject});
        } else {
          throw error;
        }
      }

      // Create directory on node for local-storage
      const testPath = '/tmp/fio-test-data';
      const promisifiedExec = promisify(exec);
      const useRemoteAccess = process.env.MCP_REMOTE_KUBECONFIG || process.env.MCP_BASTION_HOST;
      
      try {
        let mkdirCmd;
        if (useRemoteAccess) {
          const sshHost = process.env.MCP_BASTION_HOST || 'localhost';
          const sshKey = process.env.MCP_SSH_KEY || '~/.ssh/id_rsa';
          const sshUser = process.env.MCP_BASTION_USER || 'root';
          const kubeconfig = process.env.MCP_REMOTE_KUBECONFIG || '/root/.kube/config';
          
          // Get first node name
          const nodeCmd = `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${sshUser}@${sshHost} "KUBECONFIG=${kubeconfig} kubectl get nodes -o jsonpath='{.items[0].metadata.name}'"`;
          const nodeResult = await promisifiedExec(nodeCmd);
          const nodeName = nodeResult.stdout.trim();
          
          // Create directory on node using oc debug
          mkdirCmd = `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${sshUser}@${sshHost} "KUBECONFIG=${kubeconfig} oc debug node/${nodeName} -- chroot /host mkdir -p ${testPath}"`;
        } else {
          const nodeResult = await promisifiedExec('kubectl get nodes -o jsonpath=\'{.items[0].metadata.name}\'');
          const nodeName = nodeResult.stdout.trim();
          mkdirCmd = `oc debug node/${nodeName} -- chroot /host mkdir -p ${testPath}`;
        }
        await promisifiedExec(mkdirCmd);
      } catch (mkdirError) {
        console.error('Directory creation warning:', mkdirError.message);
      }

      // Create PV for local-storage testing
      const pvName = `fio-pv-${Date.now()}`;
      const pv = {
        metadata: {
          name: pvName
        },
        spec: {
          capacity: {
            storage: volumeSize
          },
          volumeMode: 'Filesystem',
          accessModes: ['ReadWriteOnce'],
          persistentVolumeReclaimPolicy: 'Delete',
          storageClassName: storageClass || 'local-storage',
          local: {
            path: testPath
          },
          nodeAffinity: {
            required: {
              nodeSelectorTerms: [
                {
                  matchExpressions: [
                    {
                      key: 'kubernetes.io/hostname',
                      operator: 'Exists'
                    }
                  ]
                }
              ]
            }
          }
        }
      };

      // Create PV
      try {
        await this.k8sApi.createPersistentVolume({body: pv});
      } catch (pvError) {
        if (pvError.code !== 409) { // Ignore if already exists
          console.error('PV creation warning:', pvError.message);
        }
      }

      // Create PVC for testing
      const pvcName = `fio-test-${Date.now()}`;
      const pvc = {
        metadata: {
          name: pvcName
        },
        spec: {
          accessModes: ['ReadWriteOnce'],
          resources: {
            requests: {
              storage: volumeSize
            }
          },
          ...(storageClass && { storageClassName: storageClass })
        }
      };

      // Create PVC using K8s API
      const pvcResult = await this.k8sApi.createNamespacedPersistentVolumeClaim({namespace: testNamespace, body: pvc});

      // Map test types to FIO rw parameter
      const fioRwMap = {
        'sequential-read': 'read',
        'sequential-write': 'write',
        'random-read': 'randread',
        'random-write': 'randwrite',
        'mixed': 'randrw'
      };
      const fioRw = fioRwMap[testType] || testType;

      // Create FIO test job
      const job = {
        metadata: {
          name: `fio-${testType}-${Date.now()}`
        },
        spec: {
          template: {
            spec: {
              containers: [
                {
                  name: 'fio',
                  image: 'quay.io/openshift/origin-tests:latest',
                  command: ['fio'],
                  args: ['--name=test', `--rw=${fioRw}`, `--bs=${blockSize}`, `--runtime=${duration}`, '--ioengine=sync', '--filename=/data/testfile', '--size=100M'],
                  volumeMounts: [
                    {
                      name: 'test-data',
                      mountPath: '/data'
                    }
                  ]
                }
              ],
              volumes: [
                {
                  name: 'test-data',
                  persistentVolumeClaim: {
                    claimName: pvcName
                  }
                }
              ],
              restartPolicy: 'Never'
            }
          },
          backoffLimit: 0
        }
      };

      // Create job using K8s API
      const batchApi = this.kubeConfig.makeApiClient(k8s.BatchV1Api);
      const jobResult = await batchApi.createNamespacedJob({namespace: testNamespace, body: job});
      const jobName = jobResult.body?.metadata?.name || jobResult.metadata?.name || job.metadata.name;

      // Wait for job completion (simplified - in production, use proper polling)
      await new Promise(resolve => setTimeout(resolve, parseInt(duration) * 1000 + 30000));

      // Get job logs using Log API
      let logs = '';
      try {
        // Get pods for the job
        const podsResponse = await this.k8sApi.listNamespacedPod({
          namespace: testNamespace,
          labelSelector: `job-name=${jobName}`
        });
        
        const items = podsResponse.body?.items || podsResponse.items || [];
        if (items.length > 0) {
          const podName = items[0].metadata.name;
          
          // Use Log API which returns plain text, not JSON
          const logApi = this.kubeConfig.makeApiClient(k8s.Log);
          try {
            logs = await logApi.log(testNamespace, podName, undefined, {
              follow: false,
              tailLines: 1000,
              pretty: false,
              timestamps: false
            });
          } catch (logError) {
            // Fallback: try direct API call
            const logResponse = await this.k8sApi.readNamespacedPodLog({
              name: podName, 
              namespace: testNamespace,
              container: undefined
            });
            logs = typeof logResponse === 'string' ? logResponse : 
                   (logResponse.body ? String(logResponse.body) : 'Log format not recognized');
          }
        } else {
          logs = 'No pods found for job';
        }
      } catch (error) {
        logs = `Failed to retrieve logs: ${error.message}`;
      }

      // Cleanup
      try {
        await batchApi.deleteNamespacedJob({name: jobName, namespace: testNamespace});
        await this.k8sApi.deleteNamespacedPersistentVolumeClaim({name: pvcName, namespace: testNamespace});
        await this.k8sApi.deletePersistentVolume({name: pvName});
      } catch (cleanupError) {
        console.error('Cleanup warning:', cleanupError.message);
      }

      return {
        content: [
          {
            type: "text",
            text: `Storage benchmark "${testType}" completed:\n${JSON.stringify({
              testType,
              blockSize,
              duration,
              volumeSize,
              storageClass,
              logs: logs.substring(0, 1000), // Truncate logs
              status: 'Completed'
            }, null, 2)}`
          }
        ]
      };

    } catch (error) {
      throw new Error(`Failed to run storage benchmark: ${error.message}`);
    }
  }

  getFioArgs(testType, blockSize, duration) {
    const baseArgs = [
      '--name=test',
      '--filename=/data/testfile',
      '--size=1G',
      `--bs=${blockSize}`,
      `--runtime=${duration}`,
      '--output-format=json'
    ];

    const testConfigs = {
      'sequential-read': ['--rw=read'],
      'sequential-write': ['--rw=write'],
      'random-read': ['--rw=randread'],
      'random-write': ['--rw=randwrite'],
      'mixed': ['--rw=randrw', '--rwmixread=70']
    };

    return [...baseArgs, ...(testConfigs[testType] || testConfigs['mixed'])];
  }

  async runNetworkTest(args) {
    try {
      const { 
        testType = 'throughput', 
        duration = '30s', 
        parallel = 1, 
        protocol = 'tcp', 
        bandwidth = '1G' 
      } = args;

      const testNamespace = 'network-test';
      
      // WORKAROUND: Use kubectl to create namespace due to client library bug
      const promisifiedExec = promisify(exec);
      const useRemoteAccess = process.env.MCP_REMOTE_KUBECONFIG || process.env.MCP_BASTION_HOST;
      
      try {
        let kubectlNsCmd;
        if (useRemoteAccess) {
          const sshHost = process.env.MCP_BASTION_HOST || 'localhost';
          const sshKey = process.env.MCP_SSH_KEY || '~/.ssh/id_rsa';
          const sshUser = process.env.MCP_BASTION_USER || 'root';
          const kubeconfig = process.env.MCP_REMOTE_KUBECONFIG || '/root/.kube/config';
          kubectlNsCmd = `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${sshUser}@${sshHost} "KUBECONFIG=${kubeconfig} kubectl create namespace ${testNamespace} --dry-run=client -o yaml | KUBECONFIG=${kubeconfig} kubectl apply -f -"`;
        } else {
          kubectlNsCmd = `kubectl create namespace ${testNamespace} --dry-run=client -o yaml | kubectl apply -f -`;
        }
        await promisifiedExec(kubectlNsCmd);
      } catch (error) {
        // Ignore if namespace already exists
        if (!error.message.includes('already exists')) {
          console.warn(`Namespace creation warning: ${error.message}`);
        }
      }

      // Create iperf3 server pod
      const serverPod = {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          name: 'iperf3-server',
          namespace: testNamespace,
          labels: {
            app: 'iperf3-server'
          }
        },
        spec: {
          containers: [
            {
              name: 'iperf3',
              image: 'networkstatic/iperf3',
              command: ['iperf3', '-s'],
              ports: [
                {
                  containerPort: 5201
                }
              ]
            }
          ]
        }
      };

      // WORKAROUND: Use kubectl directly due to client library namespace parameter bug
      const podYaml = `apiVersion: v1
kind: Pod
metadata:
  name: iperf3-server
  namespace: ${testNamespace}
  labels:
    app: iperf3-server
spec:
  containers:
  - name: iperf3
    image: networkstatic/iperf3
    command: ["iperf3", "-s"]
    ports:
    - containerPort: 5201
`;

      let kubectlCmd;
      
      if (useRemoteAccess) {
        const sshHost = process.env.MCP_BASTION_HOST || 'localhost';
        const sshKey = process.env.MCP_SSH_KEY || '~/.ssh/id_rsa';
        const sshUser = process.env.MCP_BASTION_USER || 'root';
        const kubeconfig = process.env.MCP_REMOTE_KUBECONFIG || '/root/.kube/config';
        kubectlCmd = `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${sshUser}@${sshHost} "echo '${podYaml}' | KUBECONFIG=${kubeconfig} kubectl apply -f -"`;
      } else {
        kubectlCmd = `echo '${podYaml}' | kubectl apply -f -`;
      }

      await promisifiedExec(kubectlCmd);

      // Wait for server to be ready
      await new Promise(resolve => setTimeout(resolve, 10000));

      // WORKAROUND: Get server IP using kubectl due to client library bug
      let serverIP;
      try {
        let getPodCmd;
        if (useRemoteAccess) {
          const sshHost = process.env.MCP_BASTION_HOST || 'localhost';
          const sshKey = process.env.MCP_SSH_KEY || '~/.ssh/id_rsa';
          const sshUser = process.env.MCP_BASTION_USER || 'root';
          const kubeconfig = process.env.MCP_REMOTE_KUBECONFIG || '/root/.kube/config';
          getPodCmd = `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${sshUser}@${sshHost} "KUBECONFIG=${kubeconfig} kubectl get pod iperf3-server -n ${testNamespace} -o jsonpath='{.status.podIP}'"`;
        } else {
          getPodCmd = `kubectl get pod iperf3-server -n ${testNamespace} -o jsonpath='{.status.podIP}'`;
        }
        const result = await promisifiedExec(getPodCmd);
        serverIP = result.stdout.trim();
      } catch (error) {
        throw new Error(`Could not get server pod IP: ${error.message}`);
      }

      if (!serverIP) {
        throw new Error('Server pod IP not available');
      }

      // Create iperf3 client job
      const clientArgs = [
        'iperf3',
        '-c', serverIP.toString(),
        '-t', duration.replace('s', '').toString(),
        '-P', parallel.toString(),
        '--json'
      ];

      if (protocol === 'udp') {
        clientArgs.push('-u', '-b', bandwidth.toString());
      }

      const clientJob = {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: {
          name: `iperf3-client-${Date.now()}`,
          namespace: testNamespace
        },
        spec: {
          template: {
            spec: {
              containers: [
                {
                  name: 'iperf3',
                  image: 'networkstatic/iperf3',
                  command: clientArgs
                }
              ],
              restartPolicy: 'Never'
            }
          },
          backoffLimit: 0
        }
      };

      // WORKAROUND: Use kubectl run instead of kubectl apply to avoid YAML parsing issues
      const jobName = `iperf3-client-${Date.now()}`;
      const testCommand = `iperf3 -c ${serverIP} -t ${duration.replace('s', '')} -P ${parallel} --json`;
      
      const jobYaml = `apiVersion: batch/v1
kind: Job
metadata:
  name: ${jobName}
  namespace: ${testNamespace}
spec:
  template:
    spec:
      containers:
      - name: iperf3
        image: networkstatic/iperf3
        command: ["/bin/sh"]
        args: ["-c", "${testCommand}"]
      restartPolicy: Never
  backoffLimit: 0
`;

      let kubectlJobCmd;
      if (useRemoteAccess) {
        const sshHost = process.env.MCP_BASTION_HOST || 'localhost';
        const sshKey = process.env.MCP_SSH_KEY || '~/.ssh/id_rsa';
        const sshUser = process.env.MCP_BASTION_USER || 'root';
        const kubeconfig = process.env.MCP_REMOTE_KUBECONFIG || '/root/.kube/config';
        kubectlJobCmd = `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${sshUser}@${sshHost} "echo '${jobYaml}' | KUBECONFIG=${kubeconfig} kubectl apply -f -"`;
      } else {
        kubectlJobCmd = `echo '${jobYaml}' | kubectl apply -f -`;
      }

      await promisifiedExec(kubectlJobCmd);
      const jobResult = { metadata: { name: jobName } };

      // Wait for test completion
      await new Promise(resolve => setTimeout(resolve, parseInt(duration) * 1000 + 10000));

      // Get results
      const execAsync = promisify(exec);
      const kubeconfigPath = process.env.MCP_REMOTE_KUBECONFIG || process.env.KUBECONFIG;
      const logCommand = `kubectl logs job/${jobResult.metadata.name} -n ${testNamespace} --kubeconfig ${kubeconfigPath}`;
      
      let results = '';
      try {
        const logResult = await execAsync(logCommand);
        results = logResult.stdout;
      } catch (error) {
        results = 'Failed to retrieve test results';
      }

      // WORKAROUND: Cleanup using kubectl due to client library bug
      try {
        let cleanupJobCmd, cleanupPodCmd;
        if (useRemoteAccess) {
          const sshHost = process.env.MCP_BASTION_HOST || 'localhost';
          const sshKey = process.env.MCP_SSH_KEY || '~/.ssh/id_rsa';
          const sshUser = process.env.MCP_BASTION_USER || 'root';
          const kubeconfig = process.env.MCP_REMOTE_KUBECONFIG || '/root/.kube/config';
          cleanupJobCmd = `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${sshUser}@${sshHost} "KUBECONFIG=${kubeconfig} kubectl delete job ${jobResult.metadata.name} -n ${testNamespace} --ignore-not-found"`;
          cleanupPodCmd = `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${sshUser}@${sshHost} "KUBECONFIG=${kubeconfig} kubectl delete pod iperf3-server -n ${testNamespace} --ignore-not-found"`;
        } else {
          cleanupJobCmd = `kubectl delete job ${jobResult.metadata.name} -n ${testNamespace} --ignore-not-found`;
          cleanupPodCmd = `kubectl delete pod iperf3-server -n ${testNamespace} --ignore-not-found`;
        }
        await promisifiedExec(cleanupJobCmd);
        await promisifiedExec(cleanupPodCmd);
      } catch (error) {
        console.warn(`Cleanup warning: ${error.message}`);
      }

      return {
        content: [
          {
            type: "text",
            text: `Network test "${testType}" completed:\n${JSON.stringify({
              testType,
              duration,
              parallel,
              protocol,
              bandwidth,
              results: results.substring(0, 1000), // Truncate results
              status: 'Completed'
            }, null, 2)}`
          }
        ]
      };

    } catch (error) {
      throw new Error(`Failed to run network test: ${error.message}`);
    }
  }

  async runCpuStressTest(args) {
    try {
      const { 
        testType = 'combined', 
        duration = '2m', 
        cpuCores = 2, 
        memorySize = '1G', 
        nodeSelector = {} 
      } = args;

      const testNamespace = 'stress-test';
      
      // Create test namespace
      try {
        const namespaceObject = {
          metadata: { name: testNamespace }
        };
        await this.k8sApi.createNamespace(namespaceObject);
      } catch (error) {
        if (error.response?.statusCode !== 409) {
          throw error;
        }
      }

      const stressArgs = this.getStressTestArgs(testType, duration, cpuCores, memorySize);

      const job = {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: {
          name: `stress-test-${testType}-${Date.now()}`,
          namespace: testNamespace
        },
        spec: {
          template: {
            spec: {
              containers: [
                {
                  name: 'stress',
                  image: 'polinux/stress',
                  command: ['stress'],
                  args: stressArgs,
                  resources: {
                    requests: {
                      cpu: `${cpuCores}000m`,
                      memory: memorySize
                    },
                    limits: {
                      cpu: `${cpuCores}000m`,
                      memory: memorySize
                    }
                  }
                }
              ],
              restartPolicy: 'Never',
              ...(Object.keys(nodeSelector).length > 0 && { nodeSelector })
            }
          },
          backoffLimit: 0
        }
      };

      // WORKAROUND: Use kubectl directly due to client library namespace parameter bug
      const jobYaml = `apiVersion: batch/v1
kind: Job
metadata:
  name: stress-test-${testType}-${Date.now()}
  namespace: ${testNamespace}
spec:
  template:
    spec:
      containers:
      - name: stress
        image: polinux/stress
        command: ["stress"]
        args: ${JSON.stringify(stressArgs)}
        resources:
          requests:
            cpu: ${cpuCores}000m
            memory: ${memorySize}
          limits:
            cpu: ${cpuCores}000m
            memory: ${memorySize}
      restartPolicy: Never
${Object.keys(nodeSelector).length > 0 ? `      nodeSelector:
${Object.entries(nodeSelector).map(([k, v]) => `        ${k}: ${v}`).join('\n')}` : ''}
  backoffLimit: 0
`;

      const promisifiedExec = promisify(exec);
      const useRemoteAccess = process.env.MCP_REMOTE_KUBECONFIG || process.env.MCP_BASTION_HOST;
      let kubectlCmd;
      
      if (useRemoteAccess) {
        const sshHost = process.env.MCP_BASTION_HOST || 'localhost';
        const sshKey = process.env.MCP_SSH_KEY || '~/.ssh/id_rsa';
        const sshUser = process.env.MCP_BASTION_USER || 'root';
        const kubeconfig = process.env.MCP_REMOTE_KUBECONFIG || '/root/.kube/config';
        kubectlCmd = `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${sshUser}@${sshHost} "echo '${jobYaml}' | KUBECONFIG=${kubeconfig} kubectl apply -f -"`;
      } else {
        kubectlCmd = `echo '${jobYaml}' | kubectl apply -f -`;
      }

      await promisifiedExec(kubectlCmd);
      const batchApi = this.kubeConfig.makeApiClient(k8s.BatchV1Api);
      const jobResult = { metadata: { name: `stress-test-${testType}-${Date.now()}` } };

      // Wait for test completion
      const durationSeconds = this.parseDuration(duration);
      await new Promise(resolve => setTimeout(resolve, durationSeconds * 1000 + 30000));

      // Get job status
      const finalJob = await batchApi.readNamespacedJob(jobResult.metadata.name, testNamespace);
      
      // Cleanup
      await batchApi.deleteNamespacedJob(jobResult.metadata.name, testNamespace);

      return {
        content: [
          {
            type: "text",
            text: `CPU/Memory stress test "${testType}" completed:\n${JSON.stringify({
              testType,
              duration,
              cpuCores,
              memorySize,
              nodeSelector,
              succeeded: finalJob.status?.succeeded || 0,
              failed: finalJob.status?.failed || 0,
              status: 'Completed'
            }, null, 2)}`
          }
        ]
      };

    } catch (error) {
      throw new Error(`Failed to run stress test: ${error.message}`);
    }
  }

  getStressTestArgs(testType, duration, cpuCores, memorySize) {
    const durationSeconds = this.parseDuration(duration);
    const memoryBytes = this.parseMemorySize(memorySize);
    
    const args = ['--timeout', `${durationSeconds}s`];
    
    switch (testType) {
      case 'cpu':
        args.push('--cpu', cpuCores.toString());
        break;
      case 'memory':
        args.push('--vm', '1', '--vm-bytes', `${memoryBytes}b`);
        break;
      case 'combined':
        args.push(
          '--cpu', cpuCores.toString(),
          '--vm', '1', '--vm-bytes', `${memoryBytes}b`
        );
        break;
    }
    
    return args;
  }

  parseDuration(duration) {
    const match = duration.match(/^(\d+)([sm])$/);
    if (!match) return 120; // Default 2 minutes
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    return unit === 'm' ? value * 60 : value;
  }

  parseMemorySize(size) {
    const match = size.match(/^(\d+)([KMGT]?)$/i);
    if (!match) return 1024 * 1024 * 1024; // Default 1GB
    
    const value = parseInt(match[1]);
    const unit = match[2].toUpperCase();
    
    const multipliers = {
      '': 1,
      'K': 1024,
      'M': 1024 * 1024,
      'G': 1024 * 1024 * 1024,
      'T': 1024 * 1024 * 1024 * 1024
    };
    
    return value * (multipliers[unit] || 1);
  }

  async runDatabaseBenchmark(args) {
    try {
      const { 
        dbType, 
        testType = 'oltp_read_write', 
        threads = 10, 
        duration = '60s', 
        tableSize = 100000 
      } = args;

      const testNamespace = 'db-benchmark';
      
      // Create test namespace
      try {
        const namespaceObject = {
          metadata: { name: testNamespace }
        };
        await this.k8sApi.createNamespace(namespaceObject);
      } catch (error) {
        if (error.response?.statusCode !== 409) {
          throw error;
        }
      }

      const durationSeconds = this.parseDuration(duration);
      
      let benchmarkCommand;
      if (dbType === 'postgresql') {
        benchmarkCommand = [
          'pgbench',
          '-h', 'localhost',
          '-p', '5432',
          '-U', 'postgres',
          '-c', threads.toString(),
          '-j', Math.min(threads, 4).toString(),
          '-T', durationSeconds.toString(),
          '-S', // Select-only for read-only
          'postgres'
        ];
      } else if (dbType === 'mysql') {
        benchmarkCommand = [
          'sysbench',
          `oltp_${testType}`,
          '--mysql-host=localhost',
          '--mysql-port=3306',
          '--mysql-user=root',
          '--mysql-password=mysql123',
          '--mysql-db=test',
          `--threads=${threads}`,
          `--time=${durationSeconds}`,
          `--table-size=${tableSize}`,
          'run'
        ];
      } else {
        throw new Error(`Unsupported database type: ${dbType}`);
      }

      const job = {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: {
          name: `db-benchmark-${dbType}-${Date.now()}`,
          namespace: testNamespace
        },
        spec: {
          template: {
            spec: {
              containers: [
                {
                  name: 'benchmark',
                  image: dbType === 'postgresql' ? 'postgres:13' : 'perconalab/sysbench',
                  command: benchmarkCommand
                }
              ],
              restartPolicy: 'Never'
            }
          },
          backoffLimit: 0
        }
      };

      // WORKAROUND: Use kubectl directly due to client library namespace parameter bug
      const jobYaml = `apiVersion: batch/v1
kind: Job
metadata:
  name: db-benchmark-${dbType}-${Date.now()}
  namespace: ${testNamespace}
spec:
  template:
    spec:
      containers:
      - name: benchmark
        image: ${dbType === 'postgresql' ? 'postgres:13' : 'perconalab/sysbench'}
        command: ${JSON.stringify(benchmarkCommand)}
      restartPolicy: Never
  backoffLimit: 0
`;

      const promisifiedExec = promisify(exec);
      const useRemoteAccess = process.env.MCP_REMOTE_KUBECONFIG || process.env.MCP_BASTION_HOST;
      let kubectlCmd;
      
      if (useRemoteAccess) {
        const sshHost = process.env.MCP_BASTION_HOST || 'localhost';
        const sshKey = process.env.MCP_SSH_KEY || '~/.ssh/id_rsa';
        const sshUser = process.env.MCP_BASTION_USER || 'root';
        const kubeconfig = process.env.MCP_REMOTE_KUBECONFIG || '/root/.kube/config';
        kubectlCmd = `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${sshUser}@${sshHost} "echo '${jobYaml}' | KUBECONFIG=${kubeconfig} kubectl apply -f -"`;
      } else {
        kubectlCmd = `echo '${jobYaml}' | kubectl apply -f -`;
      }

      await promisifiedExec(kubectlCmd);
      const batchApi = this.kubeConfig.makeApiClient(k8s.BatchV1Api);
      const jobResult = { metadata: { name: `db-benchmark-${dbType}-${Date.now()}` } };

      // Wait for test completion
      await new Promise(resolve => setTimeout(resolve, durationSeconds * 1000 + 30000));

      // Get results
      const execAsync = promisify(exec);
      const kubeconfigPath = process.env.MCP_REMOTE_KUBECONFIG || process.env.KUBECONFIG;
      const logCommand = `kubectl logs job/${jobResult.metadata.name} -n ${testNamespace} --kubeconfig ${kubeconfigPath}`;
      
      let results = '';
      try {
        const logResult = await execAsync(logCommand);
        results = logResult.stdout;
      } catch (error) {
        results = 'Failed to retrieve benchmark results';
      }

      // Cleanup
      await batchApi.deleteNamespacedJob(jobResult.metadata.name, testNamespace);

      return {
        content: [
          {
            type: "text",
            text: `Database benchmark "${testType}" on ${dbType} completed:\n${JSON.stringify({
              dbType,
              testType,
              threads,
              duration,
              tableSize,
              results: results.substring(0, 1000), // Truncate results
              status: 'Completed'
            }, null, 2)}`
          }
        ]
      };

    } catch (error) {
      throw new Error(`Failed to run database benchmark: ${error.message}`);
    }
  }

  // CRITICAL FIX: Improved resource parsing
  parseResourceValue(value) {
    if (!value || typeof value !== 'string') return 0;
    
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return 0;
    
    // CPU: handle cores and millicores
    if (value.endsWith('m')) {
      return numValue / 1000; // millicores to cores
    }
    if (value.match(/^\d+(\.\d+)?$/)) {
      return numValue; // cores
    }
    
    // Memory: handle various units
    const memoryUnits = {
      'Ki': 1024,
      'Mi': 1024 * 1024,
      'Gi': 1024 * 1024 * 1024,
      'Ti': 1024 * 1024 * 1024 * 1024,
      'K': 1000,
      'M': 1000 * 1000,
      'G': 1000 * 1000 * 1000,
      'T': 1000 * 1000 * 1000 * 1000
    };
    
    for (const [unit, multiplier] of Object.entries(memoryUnits)) {
      if (value.endsWith(unit)) {
        return numValue * multiplier;
      }
    }
    
    return numValue; // bytes
  }

  calculateAge(timestamp) {
    if (!timestamp) return 0;
    return Date.now() - new Date(timestamp).getTime();
  }

  formatAge(timestamp) {
    if (!timestamp) return 'unknown';
    const age = this.calculateAge(timestamp);
    const days = Math.floor(age / (24 * 60 * 60 * 1000));
    const hours = Math.floor((age % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((age % (60 * 60 * 1000)) / (60 * 1000));
    
    if (days > 0) return `${days}d${hours}h`;
    if (hours > 0) return `${hours}h${minutes}m`;
    return `${minutes}m`;
  }

  getConditionSeverity(conditionType) {
    const criticalConditions = ['OutOfDisk', 'MemoryPressure', 'DiskPressure'];
    const warningConditions = ['PIDPressure', 'NetworkUnavailable'];
    
    if (criticalConditions.includes(conditionType)) return 'critical';
    if (warningConditions.includes(conditionType)) return 'warning';
    return 'info';
  }

  extractContainerName(message) {
    const match = message.match(/Started container (.+)/);
    return match ? match[1] : 'unknown';
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("OpenShift MCP Server running on stdio");
  }
}

// Initialize and run the server
const server = new OpenShiftMCPServer();
server.run().catch((error) => {
  console.error('Failed to start OpenShift MCP Server:', error);
  process.exit(1);
});