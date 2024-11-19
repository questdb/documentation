[![Netlify Status](https://api.netlify.com/api/v1/badges/8bf4638d-8f79-4cc4-9970-b47359eb1a35/deploy-status)](https://app.netlify.com/sites/unruffled-blackwell-31bfb2/deploys)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com)
[![Code Style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-green.svg)](https://conventionalcommits.org)

# questdb.io

Uses [Docusaurus](https://docusaurus.io/). 

Pages & components are written in
TypeScript, the styles in vanilla CSS with variables using
[CSS Modules](https://github.com/css-modules/css-modules).

## Installation

```script
yarn
```

Note. On Linux you may have to install `autoconf` package to have a successful
installation. On Ubuntu it should be enough to run
`sudo apt-get install autoconf` command to install the package.

## Documentation submodule

Documentation is [hosted in a public repo](https://github.com/questdb/documentation/).

It is pulled in via a submodule.

If writing documentation, clone the repo, enter the submodule, then:

```shell
git submodule init
git submodule update --remote --merge
```

This will get you up-to-date!

Changes made within this documentation submodule are committed to the public repo.

Recommended flow is then:

1. Enter the submodule & update it as per the above command.
2. Create a new branch within it
3. Make your changes, commit to that branch
4. Create PR for that branch in documentation repo
5. Confirm PR preview is OK when ready
6. Get approval & merge :tada:

Prod deploys & PR previews will update from `main` automatically.

## Local development

```script
yarn start
```

This command starts a local development server and open up a browser window.
Most changes are reflected live without having to restart the server.

## Build for production

```script
yarn build
```

This command generates static content into the `build` directory and can be
served using any static contents hosting service. For that purpose,
use:

```script
yarn serve
```

## Bugs and features

Raise a [GH issue](https://github.com/questdb/questdb.io/issues/new/choose) for
bug report, update request, or tutorial proposal using the respective template.

## Linting

The coding style rules are defined by [Prettier](https://prettier.io/) and
enforced by [Eslint](https://eslint.org)

On top of this, we follow the rules set by the
[JavaScript Standard Style](https://standardjs.com/rules.html).

You do not need to run the linting task manually, Webpack will take care of that
for you.
