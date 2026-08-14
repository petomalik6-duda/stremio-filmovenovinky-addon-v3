# 3.7.1 – Incremental scheduled refresh

- Daily GitHub Actions schedule remains `20 3 * * *`.
- Scheduled runs now use `FORCE_FULL_REFRESH=false`.
- Manual `workflow_dispatch` defaults to `force_full=false`.
- Set `force_full=true` manually only when a full rebuild/rematch is required.
- Matcher v3 and all 3.7.0 metadata fixes are unchanged.
