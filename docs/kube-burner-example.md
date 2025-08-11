# Kube-Burner Performance Testing Integration Example

This document provides a comprehensive example of how to use the enhanced OpenShift MCP Server kube-burner integration for performance testing directly from your AI Code Assistant.

## What is Kube-Burner?

Kube-Burner is a performance testing tool specifically designed for OpenShift and Kubernetes clusters. Our MCP Server provides a simplified kube-burner-style implementation that provides:
- **Load Testing**: Simulate various workload patterns with pod density testing
- **Performance Benchmarking**: Measure cluster performance under different conditions
- **Cluster Density Testing**: Validate scheduler and resource management capabilities
- **Creation & Cleanup Operations**: Flexible workload lifecycle management

## Enhanced Features

### ✅ **Fixed Implementation**
- **Syntax Error Free**: All kubectl syntax issues resolved
- **YAML-Based Pod Creation**: Uses proper Kubernetes manifests instead of deprecated flags
- **Reliable Execution**: Improved error handling and validation
- **Operation Control**: Support for creation-only, cleanup-only, or both operations

### 🚀 **New Capabilities**
- **Flexible Operations**: `create`, `cleanup`, or `both` operation modes
- **Resource Specifications**: Proper CPU/memory requests and limits
- **Namespace Management**: Automatic namespace creation and cleanup
- **Performance Metrics**: Pod creation rates and execution timing
- **Node Distribution**: Detailed pod scheduling analysis

## Available Test Types

| Test Type | Description | Pod Count Formula | Use Case |
|-----------|-------------|-------------------|----------|
| `cluster-density-v2` | Application density testing | iterations × 5 | Measure app deployment performance |
| `node-density` | Pod density per node testing | iterations × 10 | Node capacity validation |
| `pvc-density` | Storage performance testing | iterations × 3 | Storage subsystem validation |
| `crd-scale` | Custom resource scaling | iterations × 2 | Operator performance testing |

## Operation Modes

### 1. Creation Only (`operation: "create"`)
Creates pods and namespace without cleanup:
```javascript
{
  "testType": "cluster-density-v2",
  "iterations": 8,
  "namespace": "density-test",
  "operation": "create",
  "cleanup": false
}
```

### 2. Cleanup Only (`operation: "cleanup"`)
Removes existing test namespace and all resources:
```javascript
{
  "testType": "cluster-density-v2",
  "namespace": "density-test",
  "operation": "cleanup"
}
```

### 3. Full Cycle (`operation: "both"`)
Creates workload, analyzes, then cleans up:
```javascript
{
  "testType": "cluster-density-v2",
  "iterations": 5,
  "namespace": "kube-burner-test",
  "operation": "both"
}
```

## Usage Examples Through AI Code Assistant

### Basic Performance Testing
```
"Run a cluster-density-v2 test with 5 iterations"
"Execute node density testing with 3 iterations in test-namespace"
"Create 40 pods using cluster density workload without cleanup"
```

### Advanced Performance Analysis
```
"Run cluster-density-v2 test with creation only, 8 iterations"
"Cleanup the cluster-density-v2 namespace using kube-burner"
"Execute full node density test cycle with automatic cleanup"
```

### Operational Testing
```
"Create persistent cluster density workload for analysis"
"Delete all objects in the performance-test namespace"
"Run comprehensive density testing with both creation and cleanup"
```

## Tool Parameters

### Core Parameters
- **`testType`** (string): Test type - `cluster-density-v2`, `node-density`, `pvc-density`, `crd-scale`
- **`iterations`** (number): Number of iterations (default: 5, range: 1-100)
- **`namespace`** (string): Target namespace (default: `kube-burner-test`)
- **`timeout`** (string): Test timeout duration (default: `10m`)

### Operation Control
- **`operation`** (string): Operation mode - `create`, `cleanup`, `both` (default: `create`)
- **`cleanup`** (boolean): Auto-cleanup after creation (default: `true`, only for `create` operation)

## Performance Test Results

### Creation Results
```json
{
  "testType": "cluster-density-v2",
  "iterations": 8,
  "namespace": "density-test",
  "operation": "create",
  "creation": {
    "podsCreated": 40,
    "testType": "cluster-density-v2",
    "duration": "12s",
    "status": "Completed"
  },
  "status": "Completed"
}
```

### Cleanup Results
```json
{
  "testType": "cluster-density-v2",
  "namespace": "density-test",
  "operation": "cleanup",
  "cleanup": {
    "podsDeleted": 40,
    "duration": "8s",
    "status": "Completed"
  },
  "status": "Completed"
}
```

## Resource Specifications

### Per-Pod Resources
- **CPU Request**: 1m (1 millicore)
- **Memory Request**: 10Mi
- **CPU Limit**: 10m (10 millicores)
- **Memory Limit**: 20Mi
- **Container Image**: `registry.k8s.io/pause:3.8`

### Test Scale Examples
| Iterations | cluster-density-v2 | node-density | Total CPU | Total Memory |
|------------|-------------------|--------------|-----------|--------------|
| 5 | 25 pods | 50 pods | 25-50m | 250-500Mi |
| 8 | 40 pods | 80 pods | 40-80m | 400-800Mi |
| 10 | 50 pods | 100 pods | 50-100m | 500Mi-1Gi |

## Best Practices

### For Single Node OpenShift (SNO)
- **Recommended Iterations**: 3-8 for cluster-density-v2, 2-5 for node-density
- **Monitor Resources**: Watch CPU/memory consumption during tests
- **Appropriate Timeouts**: Use 5-15 minute timeouts
- **Staged Testing**: Use creation-only for analysis, then cleanup separately

### For Multi-Node Clusters
- **Scale Appropriately**: Higher iteration counts based on cluster size
- **Namespace Isolation**: Use unique namespaces for concurrent tests
- **Resource Monitoring**: Monitor cluster-wide resource impact
- **Cleanup Management**: Implement systematic cleanup procedures

### Security Considerations
- **Namespace Isolation**: Tests create pods in dedicated namespaces
- **Resource Limits**: Built-in CPU/memory limits prevent resource exhaustion
- **Automatic Cleanup**: Optional automatic resource cleanup
- **Security Context**: Uses minimal pause containers for safety

## Troubleshooting

### Common Issues

#### 1. Pod Creation Failures
```bash
# Check node resources
kubectl describe nodes

# Check namespace quotas
kubectl describe quota -n <namespace>
```

#### 2. Timeout Issues
- Increase timeout for resource-constrained clusters
- Reduce iteration counts for slower environments
- Monitor node resource availability

#### 3. YAML Syntax Errors
- Fixed in current implementation
- Uses proper Kubernetes YAML manifests
- No deprecated kubectl flags

#### 4. Namespace Cleanup Issues
```bash
# Force delete namespace if stuck
kubectl delete namespace <namespace> --force --grace-period=0
```

## Configuration Examples

### MCP Tool Configuration
```javascript
// Cluster density test with creation only
{
  "method": "tools/call",
  "params": {
    "name": "run_kube_burner",
    "arguments": {
      "testType": "cluster-density-v2",
      "iterations": 8,
      "namespace": "cluster-density-test",
      "operation": "create",
      "cleanup": false,
      "timeout": "10m"
    }
  }
}

// Cleanup existing test namespace
{
  "method": "tools/call",
  "params": {
    "name": "run_kube_burner",
    "arguments": {
      "testType": "cluster-density-v2",
      "namespace": "cluster-density-test",
      "operation": "cleanup"
    }
  }
}

// Full cycle test with automatic cleanup
{
  "method": "tools/call",
  "params": {
    "name": "run_kube_burner",
    "arguments": {
      "testType": "node-density",
      "iterations": 5,
      "namespace": "node-density-test",
      "operation": "both",
      "timeout": "15m"
    }
  }
}
```

### Environment Variables
```bash
export KUBECONFIG=/path/to/kubeconfig
export MCP_BASTION_HOST=bastion.example.com
export MCP_BASTION_USER=admin
export MCP_SSH_KEY=~/.ssh/id_rsa
export MCP_REMOTE_KUBECONFIG=/root/.kube/config
```

## Performance Analysis

### Metrics to Monitor
- **Pod Creation Rate**: Pods created per second
- **Scheduling Latency**: Time from creation to running state
- **Resource Utilization**: CPU/memory usage during tests
- **Node Distribution**: How pods are distributed across nodes

### Analysis Commands
```bash
# Check pod distribution
kubectl get pods -n <namespace> -o wide --no-headers | awk '{print $7}' | sort | uniq -c

# Monitor resource usage
kubectl top nodes
kubectl top pods -n <namespace>

# Check pod status distribution
kubectl get pods -n <namespace> --no-headers | awk '{print $3}' | sort | uniq -c
```

## Integration Benefits

✅ **Syntax Error Free** - Resolved all kubectl compatibility issues  
✅ **Flexible Operations** - Support for creation-only, cleanup-only, or full cycle  
✅ **YAML-Based Creation** - Uses proper Kubernetes manifests for reliability  
✅ **Resource Management** - Built-in CPU/memory limits and requests  
✅ **Performance Metrics** - Detailed timing and resource usage analysis  
✅ **Production Ready** - Suitable for SNO and multi-node environments  
✅ **Namespace Management** - Automatic namespace creation and cleanup  
✅ **Error Handling** - Comprehensive error handling and validation  

## Migration from Old Implementation

### What's Changed
1. **Fixed kubectl syntax** - No more `--requests` flag errors
2. **YAML manifests** - Proper pod creation using Kubernetes YAML
3. **Operation modes** - Flexible creation/cleanup control
4. **Better error handling** - Comprehensive validation and error reporting
5. **Performance tracking** - Built-in timing and metrics collection

### Backward Compatibility
- All existing test types supported
- Same parameter names and defaults
- Enhanced with new operation control features

## Related Links

- [Kubernetes Pod Resources](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [OpenShift Performance Best Practices](https://docs.openshift.com/container-platform/latest/scalability_and_performance/optimization/optimizing-cpu-usage.html)
- [Kubectl Reference](https://kubernetes.io/docs/reference/kubectl/) 