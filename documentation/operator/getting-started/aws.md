---
title: Get started on Amazon EKS
description: Prepare Amazon EKS and deploy QuestDB Enterprise with the Kubernetes Operator.
---

# Get Started on Amazon EKS

By the end of this guide, you'll have QuestDB running on EKS and sending
backups to Amazon S3.

You'll use an EKS cluster you already have. QuestDB will grant your AWS account
access to the private operator and database images.

## Before you begin

### EKS cluster requirements

Before you start, make sure your EKS cluster has:

- Kubernetes 1.31 through 1.36;
- at least one managed, EC2-backed node group;
- Linux on every schedulable worker node;
- the Amazon EBS CSI managed add-on, `ebs.csi.aws.com`;
- an EBS CSI controller role with `AmazonEBSCSIDriverPolicyV2`;
- enough capacity for the operator and one QuestDB pod;
- at least 1 CPU and 2 GiB of available memory for the QuestDB pod; and
- capacity for one 20 GiB EBS volume.

This guide covers managed Linux node groups. It does not cover Windows,
Fargate, Hybrid Nodes, EKS Auto Mode, Karpenter, or self-managed node groups.

You'll start with one QuestDB instance. It needs 1 CPU, 2 GiB of memory, and one
20 GiB EBS volume.

Each additional instance needs the same resources.

For high availability, place worker nodes in more than one Availability Zone.

QuestDB also needs these network paths:

- the Kubernetes API server to reach the operator webhook on TCP 9443;
- the operator to reach QuestDB pods on TCP 9000, 8812, and 9003;
- worker nodes to pull images from QuestDB ECR in `eu-west-1`; and
- QuestDB pods to reach S3 and AWS STS over HTTPS.

The computer running Helm also needs HTTPS access to `ghcr.io`. For a private
cluster, provide NAT or VPC endpoints for the AWS services above.

### Access and tools

Before you continue, make sure you have:

- administrator access to the EKS cluster;
- permission to manage S3 buckets, IAM policies, and IAM roles;
- permission to add a policy to the worker-node IAM role;
- permission to associate an IAM OIDC provider with the cluster;
- [AWS CLI](https://docs.aws.amazon.com/cli/);
- [eksctl](https://eksctl.io/);
- `kubectl`;
- Helm 3.10 or later; and
- the PostgreSQL `psql` client.

Keep one Bash shell open and run the steps in order. Values you set early in
the guide are reused later.

### Information from QuestDB

QuestDB needs your AWS account ID before it can grant image access. Sign in to
the account that owns the EKS cluster, then get its ID:

```sh
AWS_ACCOUNT_ID="$(aws sts get-caller-identity \
  --query Account --output text)"
echo "AWS account: $AWS_ACCOUNT_ID"
```

Send the ID through the shared design-partner channel described on the
[Support](/docs/operator/support/) page. Ask QuestDB for:

- the current operator version; and
- access to the QuestDB ECR repositories.

Once QuestDB confirms the ECR grant, you're ready to connect to the cluster.

## 1. Connect to your EKS cluster

Start by setting your EKS cluster name and AWS Region. Add the operator version
supplied by QuestDB.

```sh
CLUSTER_NAME='<your EKS cluster name>'
AWS_REGION='<your AWS Region>'
OPERATOR_VERSION='<version provided by QuestDB>'
```

Now connect `kubectl`:

```sh
aws eks update-kubeconfig \
  --name "$CLUSTER_NAME" \
  --region "$AWS_REGION"

kubectl config current-context
kubectl get nodes
```

Check that the context and nodes belong to the cluster you want to use. Make
sure the active AWS account matches the ECR grant from QuestDB.

## 2. Check the cluster

Before installing QuestDB, confirm the Kubernetes version and EBS CSI add-on:

```sh
aws eks describe-cluster \
  --name "$CLUSTER_NAME" \
  --region "$AWS_REGION" \
  --query 'cluster.version' \
  --output text

aws eks describe-addon \
  --cluster-name "$CLUSTER_NAME" \
  --addon-name aws-ebs-csi-driver \
  --region "$AWS_REGION" \
  --query 'addon.status' \
  --output text

kubectl get csidriver ebs.csi.aws.com
```

Continue if the Kubernetes version is between 1.31 and 1.36. You should also
see `ACTIVE` and the `ebs.csi.aws.com` driver.

The driver still needs permission to create volumes. Confirm that its controller
role has `AmazonEBSCSIDriverPolicyV2`.

If the policy is missing, follow the
[AWS EBS CSI guide](https://docs.aws.amazon.com/eks/latest/userguide/ebs-csi.html).

Next, create the `gp3` StorageClass used by QuestDB:

```sh
cat <<'EOF' | kubectl apply -f -
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3
provisioner: ebs.csi.aws.com
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
parameters:
  type: gp3
  csi.storage.k8s.io/fstype: ext4
EOF

kubectl get storageclass gp3 \
  -o custom-columns=NAME:.metadata.name,PROVISIONER:.provisioner,EXPAND:.allowVolumeExpansion,MODE:.volumeBindingMode
```

Look for `ebs.csi.aws.com`, `true`, and `WaitForFirstConsumer`.

Now make sure the driver can create a volume. This quick check creates a
temporary PVC and removes it afterward.

```sh
kubectl create namespace questdb-storage-check

cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: questdb-storage-check
  namespace: questdb-storage-check
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: gp3
  resources:
    requests:
      storage: 1Gi
---
apiVersion: v1
kind: Pod
metadata:
  name: questdb-storage-check
  namespace: questdb-storage-check
spec:
  containers:
    - name: pause
      image: registry.k8s.io/pause:3.10
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: questdb-storage-check
EOF

kubectl wait pvc/questdb-storage-check \
  --namespace questdb-storage-check \
  --for=jsonpath='{.status.phase}'=Bound \
  --timeout=2m || {
  kubectl describe pvc/questdb-storage-check \
    --namespace questdb-storage-check
  exit 1
}

kubectl delete namespace questdb-storage-check --wait=true
```

When the PVC reaches `Bound`, storage is ready. If it does not, fix the EBS CSI
permissions before continuing.

Then check the worker nodes:

```sh
kubectl get nodes \
  -o custom-columns=NAME:.metadata.name,OS:.status.nodeInfo.operatingSystem,CPU:.status.allocatable.cpu,MEMORY:.status.allocatable.memory

kubectl describe nodes | grep -A 8 'Allocated resources'
```

Make sure a Linux node has room for a pod requesting 1 CPU and 2 GiB of memory.
Before continuing, verify that your EBS quota covers the requested disks and
that the node instance type supports one more attached volume.

## 3. Allow worker nodes to pull QuestDB images

EKS worker nodes pull the QuestDB images with their IAM role. This is separate
from the pod identity you'll create for S3 later.

The ECR account ID `695242380269` below belongs to QuestDB. Keep it unchanged.

Start by listing the managed node groups:

```sh
aws eks list-nodegroups \
  --cluster-name "$CLUSTER_NAME" \
  --region "$AWS_REGION"
```

Choose a node group that will run the operator and QuestDB, then get its IAM
role:

```sh
NODE_GROUP_NAME='<your EKS node group name>'
NODE_ROLE_ARN="$(aws eks describe-nodegroup \
  --cluster-name "$CLUSTER_NAME" \
  --nodegroup-name "$NODE_GROUP_NAME" \
  --region "$AWS_REGION" \
  --query 'nodegroup.nodeRole' \
  --output text)"
NODE_ROLE_NAME="${NODE_ROLE_ARN##*/}"
echo "Worker-node IAM role: $NODE_ROLE_NAME"
```

Add the permissions needed to pull the two QuestDB images:

```sh
cat >/tmp/questdb-ecr-pull.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer"
      ],
      "Resource": [
        "arn:aws:ecr:eu-west-1:695242380269:repository/questdb-enterprise-operator",
        "arn:aws:ecr:eu-west-1:695242380269:repository/questdb"
      ]
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name "$NODE_ROLE_NAME" \
  --policy-name QuestDBECRPull \
  --policy-document file:///tmp/questdb-ecr-pull.json
```

If QuestDB can run on node groups with different IAM roles, add this policy to
each role.

## 4. Create the S3 bucket and pod identity

QuestDB needs an S3 bucket for backups. First, choose its Kubernetes namespace:

```sh
QDB_NAMESPACE='qdb-tenant'
```

You can choose another namespace. Use the same value throughout the guide.

Create a bucket name from your account ID and Region, then create the bucket:

```sh
S3_BUCKET="questdb-${AWS_ACCOUNT_ID}-${AWS_REGION}"
echo "S3 bucket: $S3_BUCKET"

aws s3 mb "s3://$S3_BUCKET" --region "$AWS_REGION"
```

S3 bucket names are global. If that name is unavailable, add a short suffix to
`S3_BUCKET` and try again.

Now create a policy that limits QuestDB to its backup and replication paths.
IAM policy names are account-wide, so change this name if it is already in use.

```sh
S3_POLICY_NAME='QuestDBS3'

cat >/tmp/questdb-s3-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadBucketLocation",
      "Effect": "Allow",
      "Action": ["s3:GetBucketLocation", "s3:ListBucketMultipartUploads"],
      "Resource": "arn:aws:s3:::$S3_BUCKET"
    },
    {
      "Sid": "ListQuestDBPrefixes",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::$S3_BUCKET",
      "Condition": {
        "StringLike": {
          "s3:prefix": [
            "backup", "backup/*",
            "db/$QDB_NAMESPACE/questdb", "db/$QDB_NAMESPACE/questdb/*"
          ]
        }
      }
    },
    {
      "Sid": "ManageQuestDBObjects",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject", "s3:PutObject", "s3:DeleteObject",
        "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts"
      ],
      "Resource": [
        "arn:aws:s3:::$S3_BUCKET/backup/*",
        "arn:aws:s3:::$S3_BUCKET/db/$QDB_NAMESPACE/questdb/*"
      ]
    }
  ]
}
EOF

S3_POLICY_ARN="$(aws iam create-policy \
  --policy-name "$S3_POLICY_NAME" \
  --policy-document file:///tmp/questdb-s3-policy.json \
  --query 'Policy.Arn' \
  --output text)"
```

QuestDB pods use IAM Roles for Service Accounts (IRSA) to reach S3. First,
associate the cluster's IAM OIDC provider:

```sh
eksctl utils associate-iam-oidc-provider \
  --cluster "$CLUSTER_NAME" \
  --region "$AWS_REGION" \
  --approve

OIDC_PROVIDER="$(aws eks describe-cluster \
  --name "$CLUSTER_NAME" \
  --region "$AWS_REGION" \
  --query 'cluster.identity.oidc.issuer' \
  --output text | sed 's#^https://##')"
```

Next, create an IAM role for the `default` ServiceAccount in the QuestDB
namespace. IAM role names are account-wide, so change this name if needed.

```sh
QDB_IRSA_ROLE_NAME='QuestDBS3IRSA'

cat >/tmp/questdb-irsa-trust.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::$AWS_ACCOUNT_ID:oidc-provider/$OIDC_PROVIDER"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "$OIDC_PROVIDER:aud": "sts.amazonaws.com",
        "$OIDC_PROVIDER:sub": "system:serviceaccount:$QDB_NAMESPACE:default"
      }
    }
  }]
}
EOF

QDB_IRSA_ROLE_ARN="$(aws iam create-role \
  --role-name "$QDB_IRSA_ROLE_NAME" \
  --assume-role-policy-document file:///tmp/questdb-irsa-trust.json \
  --query 'Role.Arn' \
  --output text)"

aws iam attach-role-policy \
  --role-name "$QDB_IRSA_ROLE_NAME" \
  --policy-arn "$S3_POLICY_ARN"
```

Use this namespace only for QuestDB. Any pod using its `default` ServiceAccount
can assume the S3 role.

The operator itself receives no S3 permissions.

## 5. Install the operator

Now install the operator with Helm. The chart is public, and your ECR grant
allows the worker node to pull the private operator image.

```sh
helm install questdb-operator \
  oci://ghcr.io/questdb/charts/questdb-operator \
  --namespace questdb-operator-system \
  --create-namespace \
  --version "$OPERATOR_VERSION"
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

You're ready to create QuestDB. Create its namespace and connect the default
ServiceAccount to the S3 role:

```sh
kubectl create namespace "$QDB_NAMESPACE"

kubectl annotate serviceaccount default \
  --namespace "$QDB_NAMESPACE" \
  eks.amazonaws.com/role-arn="$QDB_IRSA_ROLE_ARN"
```

The manifest below connects QuestDB to your S3 bucket and starts one instance
with a backup every five minutes.

Keep the QuestDB ECR account ID unchanged. The tested image tag is
`3.3.4-enterprise`; change it only when QuestDB provides another one.

```sh
cat <<EOF | kubectl apply -f -
apiVersion: questdb.io/v1alpha1
kind: QuestDBObjectStore
metadata:
  name: questdb-store
  namespace: $QDB_NAMESPACE
spec:
  provider: S3
  s3:
    bucket: $S3_BUCKET
    region: $AWS_REGION
---
apiVersion: questdb.io/v1alpha1
kind: QuestDBCluster
metadata:
  name: questdb
  namespace: $QDB_NAMESPACE
spec:
  image: 695242380269.dkr.ecr.eu-west-1.amazonaws.com/questdb:3.3.4-enterprise
  instances: 1
  storage:
    storageClassName: gp3
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

The QuestDB pod connects to S3 with IRSA. The operator does not create or
inspect the bucket.

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

If you chose another namespace in step 4, use it here.

```sh
QDB_NAMESPACE='qdb-tenant'

kubectl port-forward \
  --namespace "$QDB_NAMESPACE" \
  service/questdb-rw 8812:8812 9000:9000
```

Leave the port-forward running. Open a second terminal, set the same namespace,
and connect:

```bash
QDB_NAMESPACE='qdb-tenant' # change this if you changed it in step 4

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

That's it. QuestDB is running on EKS, and its scheduled backups are going to
Amazon S3.
