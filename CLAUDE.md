# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

This is a Docusaurus-based documentation site for QuestDB. Key commands:

### Local Development
- `yarn start` - Start development server on port 3001
- `yarn build` - Build production version
- `yarn serve` - Serve built site locally

### Prerequisites
- Node.js and Yarn package manager
- Java (for railroad diagram generation)
- Python (for railroad diagram scripts)

## Architecture Overview

### Documentation Structure
- **Source**: Content lives in `/documentation/` directory
- **Static Assets**: Images, diagrams, and files in `/static/`
- **Components**: React components for documentation in `/src/components/`
- **Themes**: Custom Docusaurus theme overrides in `/src/theme/`

### Key Directories
- `documentation/` - Main documentation content (markdown/MDX files)
- `documentation/reference/` - API and SQL reference documentation
- `documentation/guides/` - User guides and tutorials
- `documentation/concept/` - Conceptual documentation
- `static/images/` - Documentation images and diagrams
- `src/components/` - Custom React components for docs
- `plugins/` - Custom Docusaurus plugins

### Content Organization
- Documentation uses hierarchical structure with sidebars defined in `documentation/sidebars.js`
- Supports both `.md` and `.mdx` files
- Partial files (`.partial.mdx`) are excluded from routing but can be imported
- Math expressions supported via KaTeX
- Mermaid diagrams supported

## Documentation Features

### Special Syntax
- **QuestDB SQL**: Use `questdb-sql` language identifier for syntax highlighting
- **Railroad Diagrams**: SQL syntax diagrams generated via `scripts/railroad.py`
- **Math**: LaTeX-style math between `$` (inline) or `$$` (block)
- **Admonitions**: `:::note`, `:::tip`, `:::info`, `:::warning`, `:::danger`

### Custom Components
- `<RemoteRepoExample />` - Include code from other QuestDB repositories
- `<TabItem />` and `<Tabs />` - Tabbed content sections
- Various custom theme components in `src/theme/`

### Image Optimization
- Lint-staged hook optimizes images automatically
- WebP conversion supported via `scripts/webp-converter.sh`
- Size checking via `scripts/check-size-hook.sh`

## Development Workflow

### Creating Railroad Diagrams
1. Use [Railroad online editor](https://www.bottlecaps.de/rr/ui) to design
2. Save syntax to `static/images/docs/diagrams/.railroad`
3. Run `python3 scripts/railroad.py [name]` to generate SVG
4. Include generated markdown in documentation

### Content Guidelines
- Follow existing file naming conventions
- Use proper admonitions for important information
- Include code examples with appropriate language identifiers
- Optimize images before committing (handled automatically by hooks)

### Linting and Formatting
- ESLint and Prettier configured for code quality
- JavaScript Standard Style rules enforced
- Format on save recommended in editor
- Webpack handles linting during development

## Configuration

### Key Config Files
- `docusaurus.config.js` - Main Docusaurus configuration
- `documentation/sidebars.js` - Documentation navigation structure
- `package.json` - Dependencies and scripts
- `tailwind.config.js` - Tailwind CSS configuration

### Environment Variables
- `ALGOLIA_APP_ID` and `ALGOLIA_API_KEY` - Search functionality
- `NETLIFY` and `CONTEXT` - Build environment detection

## Testing and Deployment
- Production builds minify CSS and disable update notifiers
- Preview builds use relaxed error handling
- Algolia search integration for documentation search
- PWA support configured with custom manifest