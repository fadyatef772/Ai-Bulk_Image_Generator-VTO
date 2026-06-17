# Dependency Report

This report outlines the dependencies that have known vulnerabilities or are outdated.

## Security Vulnerabilities
Based on \`npm audit\`, the following packages have known security vulnerabilities:
- **electron** (High) - Multiple IPC, sandbox, and integration bypass vulnerabilities.
- **esbuild** (High) - Local server vulnerabilities (used by vite).
- **joi** (Moderate) - Prototype pollution or similar moderate issues.
- **tar** (High) - Arbitrary file creation/overwrite vulnerabilities (used by electron-builder).
- **uuid** (Moderate) - Buffer bounds check vulnerability.

## Recommendations
- Upgrade `electron` to version `41.x` if compatible, or to a patched version in the `28.x` line if available.
- Upgrade `vite` to version `6.x` to get the patched `esbuild`.
- Upgrade `uuid` to `14.x`.
- Upgrade `electron-builder` to `26.x` to get the patched `tar` and `app-builder-lib`.
- Upgrade `joi` to `17.13.4`.

Running `npm update` and fixing major dependencies is strongly recommended before pushing to production.
