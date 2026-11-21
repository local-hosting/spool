# CI

| Workflow | Role |
| --- | --- |
| [`ci.yml`](workflows/ci.yml) | workspace stack install + `yarn workspace @local-hosting/spool ci` |
| [`guard-main.yml`](workflows/guard-main.yml) | reject direct pushes to `main` (PR merges only) |

Do not push to `main`; use a PR. See [branch-protection](https://github.com/local-hosting/workspace/blob/main/docs/branch-protection.md).
