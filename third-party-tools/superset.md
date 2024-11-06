---
title: Superset
description: Guide for using Superset with QuestDB
---

[Apache Superset](https://superset.apache.org/) is a popular open-source
business intelligence web application that enables users to visualize and
explore data through customizable dashboards and reports.

QuestDB provides the
[QuestDB Connect](https://pypi.org/project/questdb-connect/) python package that
implements the SQLAlchemy dialect and Superset engine specification, to
integrate Apache Superset with QuestDB.

## Installing Apache Superset via Docker (recommended)

We recommend the Docker-based Apache Superset installation. You will need to
install the following requirements:

- Docker, including Docker Compose
- QuestDB 7.1.2 or later

Then, following the steps below:

1. Clone the [Superset repo](https://github.com/apache/superset):

   ```bash
   git clone https://github.com/apache/superset.git
   ```

2. Change your directory:

   ```bash
   cd superset
   ```

3. Create a file `docker/requirements-local.txt` with the requirement to
   `questdb-connect`:

   ```bash
   touch ./docker/requirements-local.txt
   echo "questdb-connect==1.1.3" > docker/requirements-local.txt
   ```
4. Set Superset version to 4.0.2:
   This step is important to ensure compatibility with QuestDB Connect.

   ```bash
   export TAG=4.0.2
   ```

5. Run Apache Superset:

   ```bash
   docker compose -f docker-compose-image-tag.yml pull
   docker compose -f docker-compose-image-tag.yml up
   ```

   This step will initialize your Apache Superset installation, creating a
   default admin, users, and several other settings. The first time you start
   Apache Superset it can take a few minutes until it is completely initialized.
   Please keep an eye on the console output to see when Apache Superset is ready
   to be used.

## Installing Superset via QuestDB Connect

If you have a stand-alone installation of Apache Superset and are using Apache
Superset without Docker, you need to install the following requirements :

- Python from 3.9 to 3.11
- [Superset](https://superset.apache.org/docs/quickstart/) 4.0.x
- QuestDB 7.1.2 or later

Install QuestDB Connect using `pip`:

```bash
pip install 'questdb-connect==1.1.3'
```

## Connecting QuestDB to Superset

Once installed and initialized, Apache Superset is accessible via
[localhost:8088](http://localhost:8088).

1. Sign in with the following details:
   - Username: admin
   - Password: admin
2. From Superset UI, select Setting > Database Connections
3. Select `+Database` to add a new QuestDB database

   ![QuestDB Database Selection](/img/docs/superset/superset_database_selection.webp)

4. In the next step use `host.docker.internal` when running
   Apache Superset from Docker and `localhost` for outside of Docker. Port is
   `8812` by default, and the database name is `QuestDB`, default user is `admin`
    and password is `quest`.

    ![QuestDB Database Configuration](/img/docs/superset/superset_database_config.webp)
5. Once connected, tables in QuestDB will be visible for creating Datasets in
   Apache Superset.

    ![QuestDB Tables in Superset](/img/docs/superset/superset_browser.webp)

## Conclusion
The integration of Apache Superset with QuestDB allows users to visualize and
explore data through customizable dashboards and reports. This guide provides
instructions for installing Apache Superset via Docker and QuestDB Connect, and
connecting QuestDB to Apache Superset.

If you have any questions or need help, please join our [community Slack](https://slack.questdb.io/) or 
open a [GitHub issue](https://github.com/questdb/questdb-connect/issues/new).


## See also

- [QuestDB Connect at GitHub](https://github.com/questdb/questdb-connect/)
- [QuestDB Connect Python module](https://pypi.org/project/questdb-connect/)
- [Apache Superset install](https://superset.apache.org/docs/quickstart/)
- [Blog post with Superset dashboard example](/blog/time-series-data-visualization-apache-superset-and-questdb/)
