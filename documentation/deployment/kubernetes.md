---
title: Run QuestDB on Kubernetes
sidebar_label: Kubernetes
description:
  This document describes how to deploy QuestDB using a Kubernetes cluster by
  means of official Helm charts maintained by the QuestDB project
---

You can deploy QuestDB in a [Kubernetes](https://kubernetes.io) cluster using a
[StatefulSet](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/)
and a
[persistent volume](https://kubernetes.io/docs/concepts/storage/persistent-volumes/).
We distribute QuestDB via [Helm](https://helm.sh) on
[ArtifactHub](https://artifacthub.io/packages/helm/questdb/questdb).

## Prerequisites

- [Helm](https://helm.sh/docs/intro/install/)
- [Kubernetes CLI](https://kubernetes.io/docs/tasks/tools/install-kubectl/)
- [minikube](https://minikube.sigs.k8s.io/docs/start/)

## Get the QuestDB Helm chart

Using the Helm client, add the official Helm chart repository:

```shell
helm repo add questdb https://helm.questdb.io/
```

Update the Helm index:

```shell
helm repo update
```

## Run QuestDB

Start a local cluster using `minikube`:

```shell
minikube start
```

Then install the chart:

```shell
helm install my-questdb questdb/questdb
```

Finally, use the Kubernetes CLI to get the pod name:

```shell
kubectl get pods
```

Result:

| NAME         | READY | STATUS  | RESTARTS | AGE   |
| ------------ | ----- | ------- | -------- | ----- |
| my-questdb-0 | 1/1   | Running | 1        | 9m59s |

## Querying QuestDB locally

In order to run queries against your local instance of QuestDB, you can use port
forwarding:

```shell
kubectl port-forward my-questdb-0 9000
```

The following ports may also be used:

- 9000: [REST API](/docs/query/rest-api/) and
  [Web Console](/docs/getting-started/web-console/overview/)
- 8812: [Postgres](/docs/query/pgwire/overview/)
- 9009: [InfluxDB line protocol](/docs/ingestion/ilp/overview/)

## Customizing the deployment

The QuestDB Helm chart supports a variety of configuration options. Run the following to view all of them and any preconfigured defaults:

```shell
helm show values questdb/questdb
```

## Using Kubernetes secrets

QuestDB supports reading sensitive configuration values directly from mounted
secret files using the `_FILE` suffix convention. This eliminates the need for
shell scripts or init containers to inject secrets as environment variables.

For example, to configure the PostgreSQL wire protocol password from a
Kubernetes secret:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: questdb-secrets
type: Opaque
data:
  pg-password: bXktc2VjcmV0LXBhc3N3b3Jk  # base64 encoded

---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: questdb
spec:
  serviceName: questdb
  replicas: 1
  selector:
    matchLabels:
      app: questdb
  template:
    metadata:
      labels:
        app: questdb
    spec:
      containers:
        - name: questdb
          image: questdb/questdb:latest
          env:
            - name: QDB_PG_PASSWORD_FILE
              value: /run/secrets/pg-password
          volumeMounts:
            - name: secrets
              mountPath: /run/secrets
              readOnly: true
      volumes:
        - name: secrets
          secret:
            secretName: questdb-secrets
            items:
              - key: pg-password
                path: pg-password
```

:::note

This example focuses on secret mounting and omits the `volumeClaimTemplates`
needed for persistent storage. For production deployments, use the
[QuestDB Helm chart](#get-the-questdb-helm-chart) which handles storage
configuration automatically.

:::

For the full list of supported properties, see
[Secrets from files](/docs/configuration/overview/#secrets-from-files) in the
configuration reference.
