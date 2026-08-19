---
title: Get started on Azure AKS
description: Prepare Azure AKS and deploy QuestDB Enterprise with the Kubernetes Operator.
---

# Get Started on Azure AKS

By the end of this guide, you'll have QuestDB running on AKS and sending
backups to Azure Blob Storage.

You'll use an AKS cluster you already have. QuestDB will provide the credentials
needed to pull the private operator and database images.

## Before you begin

### AKS cluster requirements

Before you start, make sure your AKS cluster has:

- Kubernetes 1.33 through 1.36;
- at least one worker node;
- Linux on every schedulable worker node;
- the Azure Disk CSI driver, `disk.csi.azure.com`;
- the built-in `managed-csi` StorageClass;
- enough capacity for the operator and one QuestDB pod;
- at least 1 CPU and 2 GiB of available memory for the QuestDB pod; and
- capacity for one 20 GiB Azure Disk.

This guide covers Linux clusters only.

You'll start with one QuestDB instance. It needs 1 CPU, 2 GiB of memory, and one
Azure Disk.

Azure may bill the 20 GiB request as a 32 GiB disk SKU.

For mitigation of a partial regional outage, place worker nodes in more than one Availability Zone. Cross-AZ connectivity is not required, since all database instances communicate over a shared Object Storage Bucket.

QuestDB also needs these network paths:

- the Kubernetes API server to reach the operator webhook on TCP 9443;
- the operator to reach QuestDB pods on TCP 9000, 8812, and 9003;
- worker nodes to reach `registry.distribution.questdb.io`; and
- QuestDB pods to reach Azure Blob Storage over HTTPS.

The computer running Helm also needs HTTPS access to `ghcr.io`. For a private
cluster, provide working DNS plus egress or private endpoints for these services.

### Access and tools

Before you continue, make sure you have:

- administrator access to the AKS cluster;
- permission to create an Azure Storage account and Blob container;
- permission to read the new storage account key;
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli);
- `kubectl`;
- Helm 3.10 or later; and
- the PostgreSQL `psql` client.

Keep one Bash shell open and run the steps in order. Values you set early in
the guide are reused later.

### Information from QuestDB

QuestDB supplies access to the private images. In the shared design-partner
channel described on the [Support](/docs/enterprise-kubernetes-operator/support/) page, ask for:

- the current operator version;
- a username for `registry.distribution.questdb.io`; and
- the matching password.

The same credentials work for both images. You'll store them in two Kubernetes
Secrets later because Secrets belong to a single namespace.

## 1. Connect to your AKS cluster

Start by setting the details of your AKS cluster. Add the operator version and
registry username supplied by QuestDB.

```sh
AZURE_SUBSCRIPTION='<subscription ID or name containing your AKS cluster>'
AKS_RESOURCE_GROUP='<resource group containing your AKS cluster>'
AKS_CLUSTER_NAME='<your AKS cluster name>'
OPERATOR_VERSION='<version provided by QuestDB>'
REGISTRY_USER='<username provided by QuestDB>'
```

Switch Azure CLI to that subscription and confirm your selection:

```sh
az account set --subscription "$AZURE_SUBSCRIPTION"
az account show \
  --query '{name:name,id:id}' \
  --output table
```

You should see the subscription that contains your AKS cluster.

Now connect `kubectl`:

```sh
az aks get-credentials \
  --resource-group "$AKS_RESOURCE_GROUP" \
  --name "$AKS_CLUSTER_NAME"

kubectl config current-context
kubectl get nodes
```

Check that the context and nodes belong to the cluster you want to use.

Next, read the cluster version and location from Azure:

```sh
AKS_VERSION="$(az aks show \
  --resource-group "$AKS_RESOURCE_GROUP" \
  --name "$AKS_CLUSTER_NAME" \
  --query kubernetesVersion \
  --output tsv)"

AZURE_LOCATION="$(az aks show \
  --resource-group "$AKS_RESOURCE_GROUP" \
  --name "$AKS_CLUSTER_NAME" \
  --query location \
  --output tsv)"

printf 'AKS version: %s\nAzure location: %s\n' \
  "$AKS_VERSION" "$AZURE_LOCATION"
```

Continue if the Kubernetes version is between 1.33 and 1.36.

## 2. Check the cluster

Before installing QuestDB, confirm that AKS can provide its persistent disk.
Check the Azure Disk CSI driver and StorageClass:

```sh
kubectl get csidriver disk.csi.azure.com

kubectl get storageclass managed-csi \
  -o custom-columns=NAME:.metadata.name,PROVISIONER:.provisioner,EXPAND:.allowVolumeExpansion,MODE:.volumeBindingMode
```

Look for `disk.csi.azure.com`, `true`, and `WaitForFirstConsumer`.

Then check the worker nodes:

```sh
kubectl get nodes \
  -o custom-columns=NAME:.metadata.name,OS:.status.nodeInfo.operatingSystem,CPU:.status.allocatable.cpu,MEMORY:.status.allocatable.memory

kubectl describe nodes | grep -A 8 'Allocated resources'
```

Make sure a Linux node has room for a pod requesting 1 CPU and 2 GiB of memory.
Before continuing, verify that your subscription has enough regional Azure Disk
quota and that the node VM size supports one more attached data disk.

## 3. Create Blob storage

QuestDB needs a Blob container for backups. First, choose its Kubernetes
namespace:

```sh
QDB_NAMESPACE='qdb-tenant'
```

You can choose another namespace. Use the same value throughout the guide.

By default, the new storage account will use the AKS resource group. Set a
different existing resource group here if you prefer:

```sh
STORAGE_RESOURCE_GROUP="$AKS_RESOURCE_GROUP"
BLOB_CONTAINER='questdb'
```

Azure Storage account names must be globally unique. Create a short name, then
create the account:

```sh
STORAGE_ACCOUNT="qdb$(date +%s)"
echo "Storage account: $STORAGE_ACCOUNT"

az storage account create \
  --resource-group "$STORAGE_RESOURCE_GROUP" \
  --name "$STORAGE_ACCOUNT" \
  --location "$AZURE_LOCATION" \
  --sku Standard_LRS \
  --kind StorageV2 \
  --allow-blob-public-access false
```

If that name is unavailable, change `STORAGE_ACCOUNT` and try again.

Now get the account key and create the Blob container:

```sh
AZURE_STORAGE_KEY="$(az storage account keys list \
  --resource-group "$STORAGE_RESOURCE_GROUP" \
  --account-name "$STORAGE_ACCOUNT" \
  --query '[0].value' \
  --output tsv)"

az storage container create \
  --name "$BLOB_CONTAINER" \
  --account-name "$STORAGE_ACCOUNT" \
  --account-key "$AZURE_STORAGE_KEY" \
  >/dev/null

az storage container exists \
  --name "$BLOB_CONTAINER" \
  --account-name "$STORAGE_ACCOUNT" \
  --account-key "$AZURE_STORAGE_KEY" \
  --query exists \
  --output tsv
```

When the last command prints `true`, the container is ready.

Create the QuestDB namespace and save the storage key in a Kubernetes Secret:

```sh
kubectl create namespace "$QDB_NAMESPACE"

kubectl create secret generic questdb-azure-key \
  --namespace "$QDB_NAMESPACE" \
  --from-literal=AZURE_STORAGE_KEY="$AZURE_STORAGE_KEY"

unset AZURE_STORAGE_KEY
```

The operator uses this Secret only to configure QuestDB. The QuestDB pod makes
the actual connection to Blob Storage.

## 4. Configure image access

The QuestDB images are private, so Kubernetes needs the credentials supplied by
QuestDB. Start by creating the operator namespace:

```sh
kubectl create namespace questdb-operator-system
```

Set the registry password supplied by QuestDB:

```sh
export REGISTRY_PASSWORD='<password provided by QuestDB>'
```

Create a pull Secret in the operator namespace and another in the QuestDB
namespace:

```sh
kubectl create secret docker-registry questdb-operator-registry \
  --namespace questdb-operator-system \
  --docker-server=registry.distribution.questdb.io \
  --docker-username="$REGISTRY_USER" \
  --docker-password="$REGISTRY_PASSWORD"

kubectl create secret docker-registry questdb-registry \
  --namespace "$QDB_NAMESPACE" \
  --docker-server=registry.distribution.questdb.io \
  --docker-username="$REGISTRY_USER" \
  --docker-password="$REGISTRY_PASSWORD"

unset REGISTRY_PASSWORD
```

Kubernetes will use the first Secret for the operator and the second for the
QuestDB database image.

## 5. Install the operator

Now install the operator with Helm:

```sh
helm install questdb-operator \
  oci://ghcr.io/questdb/charts/questdb-operator \
  --namespace questdb-operator-system \
  --version "$OPERATOR_VERSION" \
  --set controllerManager.container.image.repository=registry.distribution.questdb.io/questdb-enterprise-operator \
  --set-json 'controllerManager.imagePullSecrets=[{"name":"questdb-operator-registry"}]'
```

Confirm that the operator starts successfully, then check its APIs:

```sh
kubectl rollout status \
  deployment/questdb-operator-controller-manager \
  --namespace questdb-operator-system \
  --timeout=5m

kubectl get crd \
  questdbclusters.questdb.io \
  questdbobjectstores.questdb.io \
  questdbpromotions.questdb.io
```

You should see a successful rollout followed by all three CRDs.

## 6. Create QuestDB

You're ready to create QuestDB. The manifest below connects it to your Blob
container and starts one instance with a backup every five minutes.

It uses the tested `3.3.4-enterprise` image. Change the tag only when QuestDB
provides another one.

```sh
cat <<EOF | kubectl apply -f -
apiVersion: questdb.io/v1alpha1
kind: QuestDBObjectStore
metadata:
  name: questdb-store
  namespace: $QDB_NAMESPACE
spec:
  provider: Azure
  azure:
    container: $BLOB_CONTAINER
    accountName: $STORAGE_ACCOUNT
    credentialsSecret:
      name: questdb-azure-key
---
apiVersion: questdb.io/v1alpha1
kind: QuestDBCluster
metadata:
  name: questdb
  namespace: $QDB_NAMESPACE
spec:
  image: registry.distribution.questdb.io/questdb:3.3.4-enterprise
  imagePullSecrets:
    - name: questdb-registry
  instances: 1
  storage:
    storageClassName: managed-csi
    size: 20Gi
  resources:
    requests:
      cpu: "1"
      memory: 2Gi
    limits:
      cpu: "1"
      memory: 2Gi
  objectStoreRef:
    name: questdb-store
  backup:
    enabled: true
    schedule: "*/5 * * * *"
    root: backup/
EOF
```

## 7. Wait for QuestDB and its first backup

QuestDB may take a few minutes to start. Wait until the operator has processed
the configuration and the primary is ready with observed healthy WAL writes:

```sh
generation="$(kubectl get questdbcluster questdb \
  --namespace "$QDB_NAMESPACE" \
  -o jsonpath='{.metadata.generation}')"
deadline=$(($(date +%s) + 600))

while true; do
  observed="$(kubectl get questdbcluster questdb \
    --namespace "$QDB_NAMESPACE" \
    -o jsonpath='{.status.observedGeneration}')"
  available="$(kubectl get questdbcluster questdb \
    --namespace "$QDB_NAMESPACE" \
    -o jsonpath='{range .status.conditions[?(@.type=="Available")]}{.status} {.reason}{end}')"
  progressing="$(kubectl get questdbcluster questdb \
    --namespace "$QDB_NAMESPACE" \
    -o jsonpath='{range .status.conditions[?(@.type=="Progressing")]}{.status} {.reason}{end}')"
  write_healthy="$(kubectl get questdbcluster questdb \
    --namespace "$QDB_NAMESPACE" \
    -o jsonpath='{range .status.conditions[?(@.type=="WriteHealthy")]}{.status} {.reason}{end}')"

  if [ "$observed" = "$generation" ] && \
     [ "$available" = 'True PrimaryReady' ] && \
     [ "$progressing" = 'False Settled' ] && \
     [ "$write_healthy" = 'True Healthy' ]; then
    break
  fi

  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo 'Timed out waiting for QuestDB to become ready' >&2
    kubectl describe questdbcluster questdb \
      --namespace "$QDB_NAMESPACE"
    exit 1
  fi
  sleep 5
done

echo 'QuestDB is ready'
```

Once QuestDB is ready, wait for its first scheduled backup:

```sh
deadline=$(($(date +%s) + 1200))
until [ "$(kubectl get questdbcluster questdb \
  --namespace "$QDB_NAMESPACE" \
  -o jsonpath='{.status.backup.lastBackup.status}')" = 'completed' ]; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo 'Timed out waiting for the first backup' >&2
    kubectl describe questdbcluster questdb \
      --namespace "$QDB_NAMESPACE"
    exit 1
  fi
  sleep 15
done

kubectl get questdbcluster questdb \
  --namespace "$QDB_NAMESPACE" \
  -o jsonpath='{.status.backup.lastBackup.endTime}{" completed\n"}'
```

A timestamp followed by `completed` confirms the backup worked.

## 8. Connect to QuestDB

Your QuestDB instance is ready. In one terminal, forward its PostgreSQL wire
and HTTP ports.

If you chose another namespace in step 3, use it here.

```sh
QDB_NAMESPACE='qdb-tenant'

kubectl port-forward \
  --namespace "$QDB_NAMESPACE" \
  service/questdb-rw 8812:8812 9000:9000
```

Leave the port-forward running. Open a second terminal, set the same namespace,
and connect:

```bash
QDB_NAMESPACE='qdb-tenant' # change this if you changed it in step 3

ADMIN_SECRET="$(kubectl get questdbcluster questdb \
  --namespace "$QDB_NAMESPACE" \
  -o jsonpath='{.status.adminSecretName}')"

ADMIN_PASSWORD="$(kubectl get secret "$ADMIN_SECRET" \
  --namespace "$QDB_NAMESPACE" \
  -o jsonpath='{.data.password}' | base64 --decode)"

PGPASSWORD="$ADMIN_PASSWORD" \
  psql -h 127.0.0.1 -p 8812 -U admin -d qdb

unset ADMIN_PASSWORD
```

### Open the Web Console

The same port-forward makes the QuestDB Web Console available at
[http://127.0.0.1:9000](http://127.0.0.1:9000). Open that address in your
browser and sign in with the username `admin`.

To display the generated admin password, run the following in the second
terminal. This prints a credential, so use a private terminal and do not copy
its output into logs.

```sh
ADMIN_SECRET="$(kubectl get questdbcluster questdb \
  --namespace "$QDB_NAMESPACE" \
  -o jsonpath='{.status.adminSecretName}')"

kubectl get secret "$ADMIN_SECRET" \
  --namespace "$QDB_NAMESPACE" \
  -o jsonpath='{.data.password}' | base64 --decode
echo
```

When you finish, return to the first terminal and press **Ctrl+C** to stop the
port-forward.

That's it. QuestDB is running on AKS, and its scheduled backups are going to
Azure Blob Storage.
