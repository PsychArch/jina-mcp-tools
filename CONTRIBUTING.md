# Contributing to jina-mcp-tools

## Development Workflow

### Release Channels

This project maintains two release channels using a single unified workflow:

#### 1. **Alpha Channel**
- **Trigger**: Create and push alpha version tags (e.g., `v1.2.0-alpha.0`)
- **Workflow**: `.github/workflows/npm-publish.yml`
- **Versioning**: Semantic versioning with `-alpha.N` suffix
  - Example: `1.2.0-alpha.0`, `1.2.0-alpha.1`
- **npm tag**: `alpha`
- **Installation**: `npm install jina-mcp-tools@alpha`

#### 2. **Stable Channel**
- **Trigger**: Create and push stable version tags (e.g., `v1.2.0`)
- **Workflow**: `.github/workflows/npm-publish.yml`
- **Versioning**: Standard semantic versioning
  - Example: `1.2.0`, `1.2.1`
- **npm tag**: `latest`
- **Installation**: `npm install jina-mcp-tools`

### Publishing Process

#### Publishing Alpha Releases
```bash
# 1. Update version to alpha in package.json
npm version 1.2.0-alpha.0 --no-git-tag-version

# 2. Commit the version change
git add package.json
git commit -m "Release v1.2.0-alpha.0"

# 3. Create and push the tag
git tag v1.2.0-alpha.0
git push origin v1.2.0-alpha.0

# The workflow will automatically detect it's an alpha and publish with --tag alpha
```

#### Publishing Stable Releases
```bash
# 1. Update version in package.json
npm version 1.2.0 --no-git-tag-version

# 2. Commit the version change
git add package.json
git commit -m "Release v1.2.0"

# 3. Create and push the tag
git tag v1.2.0
git push origin v1.2.0

# The workflow will automatically detect it's stable and publish with --tag latest
```

### How the Unified Workflow Works

The workflow automatically detects the release type based on the version tag:
- Tags matching `v*.*.*-alpha.*` → Published with `--tag alpha`
- Tags matching `v*.*.*` → Published with `--tag latest`

This approach:
- Uses a single Trusted Publisher configuration on npmjs.com
- Requires manual version tagging (more control, less automation)
- Clearly separates alpha and stable releases
- Maintains standard npm distribution tag conventions

### Authentication

The workflow uses **npm Trusted Publishers** (OIDC) for secure, token-free publishing:
- No `NPM_TOKEN` secrets needed
- Automatic provenance attestation
- Better supply chain security
- Configured on npmjs.com for this GitHub repository

### Requirements

- Node.js 22+
- npm latest (auto-installed in workflows)
- Trusted Publishers configured on npmjs.com
