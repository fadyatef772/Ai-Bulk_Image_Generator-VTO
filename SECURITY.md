# SECURITY.md

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability within this project, please send an e-mail to the repository owner. All security vulnerabilities will be promptly addressed.

We ask that you do not disclose the vulnerability publicly until it has been addressed.

## Security Practices

* **No secrets in repository:** We actively scan for secrets using pre-commit hooks and github actions.
* **Context Isolation:** Electron context isolation is enabled. Node integration is disabled in renderer processes.
* **Dependencies:** Dependencies are regularly audited for vulnerabilities.
