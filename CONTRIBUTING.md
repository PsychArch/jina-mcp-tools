# Contributing to jina-mcp-tools

## Development Workflow

### Release Channels

This project maintains two release channels:

#### 1. **Alpha Channel** (Automated)
- **Trigger**: Every push to `dev` branch
- **Workflow**: `.github/workflows/npm-publish-alpha.yml`
- **Versioning**: `{base-version}-alpha.{timestamp}.{commit-sha}`
  - Example: `1.2.0-alpha.20251025120345.a1b2c3d`
- **npm tag**: `alpha`
- **Installation**: `npm install jina-mcp-tools@alpha`
- **Policy**: Multiple alpha versions exist on npm, but the `@alpha` tag always points to the latest

#### 2. **Stable Channel** (Manual)
- **Trigger**: Push version tags (e.g., `v1.2.0`)
- **Workflow**: `.github/workflows/npm-publish.yml`
- **Versioning**: Semantic versioning (matches package.json)
  - Example: `1.2.0`
- **npm tag**: `latest`
- **Installation**: `npm install jina-mcp-tools`
- **Policy**: All stable versions are kept permanently

### Publishing Process

#### Publishing Alpha Releases
```bash
# Simply push to dev branch - alpha release is automatic
git add .
git commit -m "Your changes"
git push origin dev
```

The workflow will:
1. Generate a timestamped alpha version
2. Build and publish the new alpha version
3. Update the `@alpha` tag to point to the new version
4. Users can always install the latest with `npm install jina-mcp-tools@alpha`

#### Publishing Stable Releases
```bash
# 1. Update version in package.json
npm version 1.2.0  # or patch/minor/major

# 2. Push the tag
git push origin v1.2.0

# 3. The workflow will automatically publish to npm with 'latest' tag
```

### Alpha Version Management

- **@alpha tag**: Always points to the latest alpha version
- **Installation**: Users running `npm install jina-mcp-tools@alpha` get the latest development version
- **Version history**: All alpha versions remain accessible for debugging if needed
- **Automatic updates**: Each push to dev creates a new timestamped alpha

### Authentication

Both workflows use **npm Trusted Publishers** (OIDC) for secure, token-free publishing:
- No `NPM_TOKEN` secrets needed
- Automatic provenance attestation
- Better supply chain security
- Configured on npmjs.com for this GitHub repository

### Requirements

- Node.js 22+
- npm latest (auto-installed in workflows)
- Trusted Publishers configured on npmjs.com
