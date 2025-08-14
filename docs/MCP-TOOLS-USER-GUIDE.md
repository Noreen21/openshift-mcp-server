# OpenShift MCP Server - User Guide

## 🚀 Practical Guide to Cluster Management with AI Code Assistant

This guide provides real-world examples and workflows for using the OpenShift MCP Server tools through your AI Code Assistant (Cursor). All examples have been validated against live OpenShift clusters.

---

## 📋 Table of Contents

1. [Getting Started](#getting-started)
2. [Monitoring & Diagnostics](#monitoring--diagnostics)
3. [Deployment & Configuration](#deployment--configuration)
4. [Performance Testing](#performance-testing)
5. [Common Workflows](#common-workflows)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Prerequisites
- OpenShift MCP Server configured and running
- Valid kubeconfig access to your cluster
- AI Code Assistant (Cursor) with MCP integration

### Quick Verification
Ask your AI assistant: *"Check the overall health of the OpenShift cluster"*

Expected response: Cluster status report with node and pod health information.

---

## Monitoring & Diagnostics

### 🔍 Cluster Health Monitoring

#### Basic Health Check
**Natural Language:** *"Check the overall health of the OpenShift cluster"*

**What it does:**
- Reports cluster status (healthy/warning/critical)
- Counts total and healthy nodes/pods
- Identifies immediate issues

**Example Output:**
```json
{
  "status": "healthy",
  "totalNodes": 3,
  "healthyNodes": 3,
  "totalPods": 142,
  "healthyPods": 140,
  "issuesFound": 2
}
```

**When to use:** Daily health checks, incident investigation, pre-deployment validation

#### Detailed Health Analysis
**Natural Language:** *"Run comprehensive cluster health validation before production deployment"*

**What it does:**
- Deep analysis of all cluster components
- Detailed issue descriptions
- Recommendations for fixes

---

### 📊 Performance Monitoring

#### Real-time Metrics
**Natural Language:** *"Get performance metrics for the last hour"*

**What it provides:**
- Node CPU/Memory utilization
- Pod resource consumption
- Network and storage metrics
- Trend analysis

**Use Cases:**
- Capacity planning
- Performance troubleshooting
- Resource optimization
- SLA monitoring

#### Resource Issue Detection
**Natural Language:** *"Are there any resource issues in the cluster?"*

**What it finds:**
- High CPU/memory pods
- Resource-starved containers
- Nodes under pressure
- Potential bottlenecks

**Example Response:**
```json
{
  "highCpuPods": [
    {
      "pod": "web-app-7d4b8c9f-xyz",
      "namespace": "production",
      "cpuUsage": "85%",
      "recommendation": "Consider increasing CPU limits"
    }
  ]
}
```

---

### 🔧 Node Management

#### Node Health Monitoring
**Natural Language:** *"Show me the current node conditions"*

**What it checks:**
- Node readiness status
- Disk pressure conditions
- Memory pressure warnings
- Network connectivity

**Typical Use:** Infrastructure monitoring, capacity planning, troubleshooting

---

### 📈 Application Monitoring

#### Deployment Health
**Natural Language:** *"Monitor deployment status in the production namespace"*

**What it reports:**
- Deployment readiness
- Replica status
- Rolling update progress
- Configuration issues

#### Pod Disruption Analysis
**Natural Language:** *"Analyze pod disruptions in the default namespace"*

**What it tracks:**
- Pod restart patterns
- Eviction events
- Resource conflicts
- Stability metrics

---

## Deployment & Configuration

### 🚀 Application Deployment

#### High-Performance Web Application
**Natural Language:** *"Create a new deployment with guaranteed QoS using 4 CPU cores in namespace prod-web"*

**What it creates:**
- Deployment with guaranteed resource allocation
- CPU/Memory limits equal to requests
- Optimized for consistent performance
- Production-ready configuration

**Resource Configuration:**
```yaml
resources:
  requests:
    cpu: "4000m"
    memory: "4Gi"
  limits:
    cpu: "4000m"
    memory: "4Gi"
```

**Best for:** Critical applications, consistent performance requirements

#### Microservices Architecture
**Natural Language:** *"Create a service mesh configuration for microservices communication"*

**What it sets up:**
- Service discovery
- Load balancing
- Network policies
- Inter-service communication

---

### 🗄️ Database Deployment

#### Production PostgreSQL
**Natural Language:** *"Deploy a PostgreSQL database with persistent storage in the production namespace"*

**What it includes:**
- Persistent volume claims
- Optimized configurations
- Security best practices
- Backup considerations

**Storage Options:**
- `10Gi` - Development/testing
- `50Gi` - Small production
- `100Gi+` - Large production

#### Redis High Availability
**Natural Language:** *"Deploy a Redis cluster with high availability configuration"*

**Features:**
- Master-slave replication
- Automatic failover
- Persistent storage
- Performance optimization

#### Multi-Database Stack
**Natural Language:** *"Deploy monitoring stack with Prometheus and Grafana using MySQL as backend"*

**Complete Setup:**
- MySQL for data persistence
- Configured for monitoring workloads
- Optimized storage allocation
- Integration-ready

---

### ⚖️ Auto-Scaling Configuration

#### Web Application Scaling
**Natural Language:** *"Set up a horizontal pod autoscaler for the web application"*

**Auto-scaling Rules:**
- CPU threshold: 70%
- Memory threshold: 80%
- Min replicas: 2 (high availability)
- Max replicas: 10 (cost control)

**When it scales:**
- **Scale up:** During traffic spikes, high resource usage
- **Scale down:** During low usage periods
- **Maintains:** Minimum availability requirements

---

### 🔒 Security Configuration

#### Network Isolation
**Natural Language:** *"Create network policies to secure pod-to-pod communication"*

**Security Features:**
- Default deny all traffic
- Explicit allow rules
- Namespace isolation
- Service-specific access

**Example Policy:**
```yaml
# Only allows traffic from trusted-app to secure-app
ingress:
  - from:
    - podSelector:
        matchLabels:
          app: trusted-app
```

---

## Performance Testing

### 🏋️ Load Testing

#### Cluster Density Testing
**Natural Language:** *"Execute cluster density testing with kube-burner to measure application deployment performance"*

**What it tests:**
- Maximum pod density per node
- Deployment creation speed
- Resource allocation efficiency
- Scale limits

**Test Parameters:**
- **Iterations:** Number of test cycles
- **Timeout:** Maximum test duration
- **Namespace:** Isolated test environment

#### Storage Performance
**Natural Language:** *"Run storage performance benchmarks using FIO workloads"*

**Benchmark Types:**
- **Sequential Read/Write:** Large file operations
- **Random Read/Write:** Database-like workloads
- **Mixed Workloads:** Real-world simulation

**Key Metrics:**
- IOPS (Input/Output Operations Per Second)
- Throughput (MB/s)
- Latency (microseconds)

---

### 🌐 Network Testing

#### Throughput Analysis
**Natural Language:** *"Test network throughput between pods using iperf3"*

**Test Scenarios:**
- **TCP Throughput:** Reliable data transfer
- **UDP Performance:** Low-latency applications
- **Parallel Streams:** Concurrent connections

**Use Cases:**
- Network configuration validation
- Performance troubleshooting
- Capacity planning

---

### 💻 Resource Stress Testing

#### CPU and Memory Testing
**Natural Language:** *"Perform CPU and memory stress testing on worker nodes"*

**Test Types:**
- **CPU Stress:** Computational workload simulation
- **Memory Stress:** Large dataset processing
- **Combined Stress:** Real-world application simulation

**Benefits:**
- Validates node capacity
- Tests resource limits
- Identifies bottlenecks

---

### 🗃️ Database Performance

#### PostgreSQL Benchmarking
**Natural Language:** *"Execute database performance tests with sysbench or pgbench"*

**Test Workloads:**
- **OLTP Read/Write:** Transaction processing
- **Read-Only:** Query performance
- **Write-Only:** Insert/update performance

**Metrics:**
- Transactions per second (TPS)
- Query response time
- Connection handling

---

## Common Workflows

### 🔄 Daily Operations Workflow

1. **Morning Health Check**
   - *"Check the overall health of the OpenShift cluster"*
   - *"Are there any resource issues in the cluster?"*

2. **Performance Review**
   - *"Get performance metrics for the last hour"*
   - *"Show me the current node conditions"*

3. **Application Monitoring**
   - *"Monitor deployment status in the production namespace"*
   - *"Analyze pod disruptions in the default namespace"*

### 🚀 New Application Deployment Workflow

1. **Pre-deployment Validation**
   - *"Run comprehensive cluster health validation before production deployment"*

2. **Application Deployment**
   - *"Create a new deployment with guaranteed QoS using 2 CPU cores in namespace my-app"*

3. **Service Configuration**
   - *"Create a service mesh configuration for microservices communication"*

4. **Auto-scaling Setup**
   - *"Set up a horizontal pod autoscaler for the web application"*

5. **Security Configuration**
   - *"Create network policies to secure pod-to-pod communication"*

### 🔧 Performance Testing Workflow

1. **Infrastructure Testing**
   - *"Perform CPU and memory stress testing on worker nodes"*
   - *"Test network throughput between pods using iperf3"*

2. **Storage Validation**
   - *"Run storage performance benchmarks using FIO workloads"*

3. **Application Load Testing**
   - *"Execute cluster density testing with kube-burner"*

4. **Database Performance**
   - *"Execute database performance tests with PostgreSQL"*

### 🆘 Incident Response Workflow

1. **Initial Assessment**
   - *"Check the overall health of the OpenShift cluster"*
   - *"Are there any resource issues in the cluster?"*

2. **Deep Dive Analysis**
   - *"Get performance metrics for the last hour"*
   - *"Show me the current node conditions"*

3. **Application Impact**
   - *"Monitor deployment status in the production namespace"*
   - *"Analyze pod disruptions in the default namespace"*

4. **Recovery Validation**
   - *"Test cluster recovery scenarios and failover mechanisms"*

---

## Best Practices

### 🎯 Monitoring Best Practices

1. **Regular Health Checks**
   - Run cluster health checks daily
   - Monitor resource usage trends
   - Set up automated alerts for critical issues

2. **Performance Baselines**
   - Establish baseline metrics
   - Monitor deviation from normal patterns
   - Document performance characteristics

3. **Proactive Monitoring**
   - Check node conditions regularly
   - Monitor deployment health continuously
   - Analyze pod disruption patterns

### 🚀 Deployment Best Practices

1. **Resource Planning**
   - Use guaranteed QoS for critical applications
   - Plan for auto-scaling requirements
   - Consider resource limits and requests

2. **Security Configuration**
   - Implement network policies
   - Use namespace isolation
   - Follow least-privilege principles

3. **High Availability**
   - Deploy across multiple nodes
   - Configure auto-scaling appropriately
   - Plan for failure scenarios

### ⚡ Performance Testing Best Practices

1. **Test Environment**
   - Use dedicated test namespaces
   - Mirror production configurations
   - Isolate testing workloads

2. **Gradual Testing**
   - Start with small-scale tests
   - Gradually increase load
   - Monitor system behavior

3. **Documentation**
   - Record test parameters
   - Document results
   - Track performance trends

---

## Troubleshooting

### ❌ Common Issues and Solutions

#### Deployment Failures
**Symptoms:** Pods not starting, deployment stuck
**Investigation:** *"Monitor deployment status in the [namespace]"*
**Common Causes:**
- Resource constraints
- Image pull failures
- Configuration errors

#### Performance Issues
**Symptoms:** Slow response times, timeouts
**Investigation:** 
- *"Get performance metrics for the last hour"*
- *"Are there any resource issues in the cluster?"*
**Common Causes:**
- CPU/Memory bottlenecks
- Network latency
- Storage performance

#### Node Problems
**Symptoms:** Pods evicted, scheduling failures
**Investigation:** *"Show me the current node conditions"*
**Common Causes:**
- Disk pressure
- Memory pressure
- Network connectivity

### 🔧 Diagnostic Commands

| Issue Type | Natural Language Query |
|------------|----------------------|
| General Health | *"Check the overall health of the OpenShift cluster"* |
| Resource Problems | *"Are there any resource issues in the cluster?"* |
| Node Issues | *"Show me the current node conditions"* |
| App Problems | *"Monitor deployment status in the [namespace]"* |
| Performance | *"Get performance metrics for the last hour"* |
| Stability | *"Analyze pod disruptions in the [namespace]"* |

### 📞 Getting Help

1. **Check Cluster Health First**
   - Always start with overall health check
   - Identify immediate issues

2. **Gather Performance Data**
   - Collect current metrics
   - Analyze resource usage patterns

3. **Document Issues**
   - Record error messages
   - Note timing and frequency
   - Include relevant configurations

---

## 📚 Additional Resources

- **README.md** - Installation and configuration guide
- **OpenShift Documentation** - Official OpenShift guides
- **Kubernetes Resources** - Core Kubernetes concepts

---

## 🎯 Quick Reference

### Most Common Commands

| Use Case | Natural Language |
|----------|------------------|
| Health Check | *"Check the overall health of the OpenShift cluster"* |
| Resource Monitor | *"Are there any resource issues in the cluster?"* |
| Deploy App | *"Create a new deployment with [specs] in namespace [name]"* |
| Auto-scale | *"Set up a horizontal pod autoscaler for the [app-name]"* |
| Database Deploy | *"Deploy a [database-type] database with persistent storage"* |
| Performance Test | *"Run storage performance benchmarks using FIO workloads"* |
| Network Test | *"Test network throughput between pods using iperf3"* |
| Security Setup | *"Create network policies to secure pod-to-pod communication"* |

### Response Time Expectations

- **Monitoring Commands:** 1-2 seconds
- **Deployment Commands:** 1-3 seconds
- **Performance Tests:** 30-90 seconds
- **Cluster Analysis:** 1-5 seconds

---

*This guide is based on validated examples tested against live OpenShift clusters. All commands have been verified to work correctly with the OpenShift MCP Server.* 