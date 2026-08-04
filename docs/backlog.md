# Backlog

## Finish private Custom GPT setup

The read-only, per-user OAuth integration is deployed. Complete the remaining setup inside the owner's signed-in ChatGPT account:

- Create a private Custom GPT for training analysis.
- Import the OpenAPI schema URL shown under **Account → ChatGPT** in the app.
- Configure OAuth using the admin-only authorization URL, token URL, client ID, client secret, and `training:read` scope shown on that page.
- Add the published privacy-policy URL from the same configuration panel.
- Test authorization with two app users and confirm each GPT session can access only the signed-in user's activities.
- Keep the GPT private initially; decide later whether to share it by link with all app users.

Acceptance criteria:

- The Custom GPT can retrieve the authorized user's profile, activities, and training summaries.
- No write operations are available to the GPT.
- Users can revoke ChatGPT access from their Account page.
- Another user's training data cannot be retrieved through the authorized session.

## Move development workspace out of OneDrive

Problem: the repository currently lives under `OneDrive - Gama`, so Git operations, frontend builds, dependency installs, caches, and generated files can trigger OneDrive to sync many small files.

Goal: keep development work in a non-synced local directory, for example `C:\dev\rehab`, and use OneDrive only for documents or deliberate backups.

Options to evaluate:

- Move the working clone to `C:\dev\rehab` and keep pushing to GitHub as the source of truth.
- Keep the OneDrive copy as an archive only, not as the active development workspace.
- If a shared-drive copy is required, use a separate non-synced Git worktree or clone for active development.
- Add local cleanup guidance for generated folders such as `frontend\dist`, `frontend\node_modules`, caches, and temporary files.

Acceptance criteria:

- Normal coding, testing, committing, and deploying no longer causes OneDrive to sync thousands of Git or build files.
- The project can still be backed up and deployed through GitHub.
- The setup is documented so future Codex work uses the non-synced workspace.
