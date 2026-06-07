#BN|- Confirmed Task 14 right-ops sidebar collapse state persists (localStorage key easylink_right_sidebar_collapsed) after logging in via API stub admin001.
#YN|- Added AppShell-level guard so authenticated non-admins heading to /machine are rerouted to /dashboard, keeping wider nav logic untouched.
#QP|- Implemented a post-toggle root data-theme verification with a one-shot remount fallback to recover from stale render state.
