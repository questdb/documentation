# QuestDB Documentation

Uses [Docusaurus](https://docusaurus.io/). 

## Quick start

First, clone & enter the repo directory:

```shell
git clone git@github.com:questdb/documentation.git
cd documentation
```

Next, install dependencies:

```script
yarn
```

```script
yarn start
```

This command starts a local development server and open up a browser window.

Most changes are reflected live without having to restart the server.

## Creating PRs

First create a new branch.

Locally, ensure your changes look good.

Then push your branch to GitHub and create a PR.

We'll review the PR and generate a preview build.

A QuestDB member must add the `preview` label to your PR to deploy a preview build.

Once it looks good, we'll merge!

## Enhancements, bugs, typos 

We'd love your help!

Raise a [GH issue](https://github.com/questdb/documentation/issues/new/choose) or tackle a PR.

## Linting

The coding style rules are defined by [Prettier](https://prettier.io/) and
enforced by [Eslint](https://eslint.org)

On top of this, we follow the rules set by the
[JavaScript Standard Style](https://standardjs.com/rules.html).

You do not need to run the linting task manually, Webpack will take care of that
for you.
