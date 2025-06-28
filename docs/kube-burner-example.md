# Kube-Burner Performance Testing Integration Example

This document provides a comprehensive example of how to extend the OpenShift MCP Server to integrate with [kube-burner-ocp](https://github.com/kube-burner/kube-burner-ocp) for performance testing directly from your IDE.

## What is Kube-Burner?

Kube-Burner is a performance testing tool specifically designed for OpenShift and Kubernetes clusters. It provides:
- **Load Testing**: Simulate various workload patterns
- **Performance Benchmarking**: Measure cluster performance under different conditions
- **Metrics Collection**: Gather detailed performance data from Prometheus
- **Stress Testing**: Validate cluster behavior under high load

## Setup Instructions

### 1. Install Kube-Burner on Target System

For direct cluster access:
```bash
# Download latest release
KUBE_BURNER_VERSION=$(curl -s https://api.github.com/repos/kube-burner/kube-burner-ocp/releases/latest | grep tag_name | cut -d'"' -f4)
curl -L https://github.com/kube-burner/kube-burner-ocp/releases/download/$KUBE_BURNER_VERSION/kube-burner-ocp-$KUBE_BURNER_VERSION-linux-x86_64.tar.gz -o kube-burner-ocp.tar.gz
tar -xzf kube-burner-ocp.tar.gz
sudo mv kube-burner-ocp /usr/local/bin/
chmod +x /usr/local/bin/kube-burner-ocp
```

For bastion host setup (private clusters):
```bash
# Install on bastion host
sshpass -p "your-password" ssh -o StrictHostKeyChecking=no user@bastion-host "
# Download and install kube-burner-ocp
KUBE_BURNER_VERSION=\$(curl -s https://api.github.com/repos/kube-burner/kube-burner-ocp/releases/latest | grep tag_name | cut -d'\"' -f4)
curl -L https://github.com/kube-burner/kube-burner-ocp/releases/download/\$KUBE_BURNER_VERSION/kube-burner-ocp-\$KUBE_BURNER_VERSION-linux-x86_64.tar.gz -o kube-burner-ocp.tar.gz
tar -xzf kube-burner-ocp.tar.gz
sudo mv kube-burner-ocp /usr/local/bin/
chmod +x /usr/local/bin/kube-burner-ocp
"
```

### 2. Add Performance Testing Tools to MCP Server

Enhance your `index.js` with performance testing capabilities:

```javascript
// Add to tools list
{
  name: "run_performance_test",
  description: "Execute kube-burner performance tests on the OpenShift cluster",
  inputSchema: {
    type: "object",
    properties: {
      testType: {
        type: "string",
        enum: ["cluster-health", "cluster-density-v2", "node-density", "pvc-density", "network-policy", "crd-scale"],
        description: "Type of performance test to run"
      },
      iterations: {
        type: "number",
        description: "Number of test iterations",
        default: 3,
        minimum: 1,
        maximum: 100
      },
      timeout: {
        type: "string",
        description: "Test timeout duration (e.g., '10m', '1h')",
        default: "10m"
      },
      namespace: {
        type: "string",
        description: "Target namespace for testing (optional)"
      }
    },
    required: ["testType"]
  }
},
{
  name: "collect_performance_metrics",
  description: "Collect historical performance metrics from the cluster",
  inputSchema: {
    type: "object",
    properties: {
      duration: {
        type: "string",
        description: "Time duration to collect metrics (e.g., '1h', '24h')",
        default: "1h"
      },
      metricsProfile: {
        type: "string",
        enum: ["basic", "detailed", "custom"],
        description: "Metrics collection profile",
        default: "basic"
      },
      outputFormat: {
        type: "string",
        enum: ["json", "csv"],
        description: "Output format for metrics",
        default: "json"
      }
    }
  }
}

// Add implementation methods
async runPerformanceTest(testType, iterations = 3, timeout = "10m", namespace = null) {
  try {
    const namespaceParam = namespace ? `--namespace=${namespace}` : "";
    const command = `sshpass -p "${this.bastionPassword}" ssh -o StrictHostKeyChecking=no ${this.bastionUser}@${this.bastionHost} "
      export KUBECONFIG='${this.kubeconfigPath}'
      kube-burner-ocp ${testType} --iterations=${iterations} --timeout=${timeout} --local-indexing --log-level=info ${namespaceParam}
    "`;
    
    const result = await this.executeCommand(command);
    
    return {
      status: "success",
      testType: testType,
      iterations: iterations,
      timeout: timeout,
      namespace: namespace,
      results: this.parseKubeBurnerResults(result),
      metricsPath: `/tmp/cluster-metrics-${Date.now()}`,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: "error",
      testType: testType,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

async collectPerformanceMetrics(duration = "1h", metricsProfile = "basic", outputFormat = "json") {
  try {
    const endTime = Math.floor(Date.now() / 1000);
    const startTime = endTime - this.parseDuration(duration);
    
    const metricsConfig = this.getMetricsProfile(metricsProfile);
    const outputDir = `/tmp/metrics-${Date.now()}`;
    
    const command = `sshpass -p "${this.bastionPassword}" ssh -o StrictHostKeyChecking=no ${this.bastionUser}@${this.bastionHost} "
      export KUBECONFIG='${this.kubeconfigPath}'
      mkdir -p ${outputDir}
      echo '${metricsConfig}' > ${outputDir}/metrics.yml
      kube-burner-ocp index --start=${startTime} --end=${endTime} --metrics-profile=${outputDir}/metrics.yml --metrics-directory=${outputDir}
    "`;
    
    const result = await this.executeCommand(command);
    
    return {
      status: "success",
      duration: duration,
      metricsProfile: metricsProfile,
      outputFormat: outputFormat,
      metricsPath: outputDir,
      startTime: new Date(startTime * 1000).toISOString(),
      endTime: new Date(endTime * 1000).toISOString(),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: "error",
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}
```

## Available Performance Tests

| Test Type | Description | Use Case |
|-----------|-------------|----------|
| `cluster-health` | Basic cluster health validation | Pre-test validation |
| `cluster-density-v2` | Application density testing | Measure app deployment performance |
| `node-density` | Pod density per node testing | Node capacity validation |
| `pvc-density` | Storage performance testing | Storage subsystem validation |
| `network-policy` | Network policy performance | Network security impact |
| `crd-scale` | Custom resource scaling | Operator performance testing |

## Usage Examples Through Cursor IDE

### Basic Performance Testing
```
"Run a cluster health check before starting performance tests"
"Execute a cluster density test with 5 iterations"
"Test storage performance with PVC density testing"
```

### Advanced Performance Analysis
```
"Run network policy performance testing for 10 minutes"
"Collect detailed performance metrics from the last 2 hours"
"Execute custom resource scaling test with 20 iterations"
```

### Comparative Testing
```
"Run node density testing before and after the deployment"
"Compare cluster performance metrics from yesterday vs today"
"Execute comprehensive performance suite across all test types"
```

## Performance Test Results

Results include:
- **Test Execution Summary**: Success/failure status, duration, iterations
- **Performance Metrics**: Latency, throughput, resource utilization
- **Resource Usage**: CPU, memory, storage consumption during tests
- **Error Analysis**: Failed operations, timeout issues, resource constraints
- **Recommendations**: Performance optimization suggestions

## Best Practices

### For Single Node OpenShift (SNO)
- Use lower iteration counts (3-10)
- Monitor resource consumption during tests
- Set appropriate timeouts (5-15 minutes)
- Avoid tests requiring multiple nodes

### For Multi-Node Clusters
- Scale iterations based on cluster size
- Use namespace isolation for concurrent tests
- Monitor cluster-wide resource impact
- Implement test scheduling for production clusters

### Security Considerations
- Use dedicated test namespaces
- Implement resource quotas for test workloads
- Monitor cluster security policies during tests
- Clean up test resources automatically

## Troubleshooting Performance Tests

### Common Issues
1. **Test Timeouts**: Increase timeout values for resource-constrained clusters
2. **Resource Exhaustion**: Reduce iteration counts or implement resource limits
3. **Network Connectivity**: Verify bastion host and cluster connectivity
4. **Metrics Collection**: Ensure Prometheus is accessible and configured

### Debug Commands
```bash
# Verify kube-burner installation
kube-burner-ocp version

# Test cluster connectivity
kube-burner-ocp cluster-health

# List available test types
kube-burner-ocp --help
```

## Configuration Examples

### MCP Tool Configuration
```javascript
// Example tool call for performance testing
{
  "method": "tools/call",
  "params": {
    "name": "run_performance_test",
    "arguments": {
      "testType": "cluster-density-v2",
      "iterations": 5,
      "timeout": "10m"
    }
  }
}

// Example tool call for metrics collection
{
  "method": "tools/call",
  "params": {
    "name": "collect_performance_metrics",
    "arguments": {
      "duration": "2h",
      "metricsProfile": "detailed",
      "outputFormat": "json"
    }
  }
}
```

### Environment Variables for Kube-Burner Integration
```bash
export KUBECONFIG=/path/to/kubeconfig
export BASTION_HOST=bastion.example.com
export BASTION_USER=root
export BASTION_PASSWORD=your-password
export KUBECONFIG_PATH=/root/cluster/kubeconfig
```

## Integration Benefits

✅ **Comprehensive Performance Testing** - Full OpenShift cluster performance analysis  
✅ **Metrics Collection** - Historical performance data gathering  
✅ **Health Monitoring** - Continuous cluster health validation  
✅ **Automated Testing** - Performance tests through Cursor IDE  
✅ **Production Ready** - Suitable for SNO and multi-node environments with proper resource limits  

## Related Links

- [Kube-Burner OCP Documentation](https://kube-burner.github.io/kube-burner-ocp/)
- [OpenShift Performance Best Practices](https://docs.openshift.com/container-platform/latest/scalability_and_performance/optimization/optimizing-cpu-usage.html)
- [Performance Testing Guide](https://github.com/kube-burner/kube-burner-ocp/tree/main/docs) 