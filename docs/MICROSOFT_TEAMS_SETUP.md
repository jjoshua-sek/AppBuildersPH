# Microsoft Teams school assistant

## Implemented

- Native Android planner database, independent of the game database and Metro.
- Local tasks with optional due dates and completion checkboxes.
- Microsoft browser sign-in using AppAuth, authorization-code flow and PKCE. No client secret.
- OAuth credentials encrypted with an Android Keystore AES-GCM key; credentials never enter JavaScript or the task database.
- Read-only Graph assignment sync, following all assignment pagination links before updating the cache.
- Latest 50 top-level posts per channel in the user's joined Teams. The cache keeps at most 500 posts; it does not download attachment contents or message replies.
- Background network-constrained sync through WorkManager, periodic refresh, retry/backoff, reconnect/resume refresh while the app is open, and a manual “Save latest updates” action.
- Reminders from the local cache, with a separate worker that can run offline.
- Optional draggable Android overlay bubble with a native checklist. It requires Android's “Display over other apps” permission and uses a foreground notification while visible.
- Remote assignment completion is not modified: checklist completion is local only.

## What is still required

No Microsoft registration or school credentials were present when this feature was implemented. Real sign-in and live sync cannot be verified until a school administrator supplies an app registration and consent.

1. Open Microsoft Entra admin center → App registrations → New registration. A school administrator may need to do this if student accounts cannot register apps.
2. Name the application `Backpack Tutor`. Prefer accounts in the school's organizational directory for the initial deployment.
3. In Authentication, add a **Mobile and desktop applications** platform and this exact custom redirect URI:

   ```text
   com.backpacktutor://oauth/microsoft
   ```

   Do not register it as a Web or SPA redirect. This is a public native client using PKCE. No client secret should be created or shipped in the app.

4. Add these **Microsoft Graph delegated** permissions:
   - `User.Read`
   - `EduAssignments.ReadBasic`
   - `Team.ReadBasic.All`
   - `Channel.ReadBasic.All`
   - `ChannelMessage.Read.All`

   The sign-in request also asks for `openid`, `profile`, and `offline_access`. The education assignment and channel-message scopes require administrator consent. Grant consent within the school tenant. Personal Microsoft accounts are not supported for education assignments.

5. Copy the **Application (client) ID** and **Directory (tenant) ID** into `src/config/schoolAgent.ts`:

   ```ts
   export const schoolAgentConfig = {
     microsoftClientId: 'APPLICATION-CLIENT-ID',
     microsoftTenantId: 'DIRECTORY-TENANT-ID',
   };
   ```

   These IDs are public configuration. Do not paste passwords, access tokens, refresh tokens, or a client secret into the source code. A single-tenant registration must use its actual directory ID rather than `organizations`.

6. Reload the debug app, open the Home gear → Study planner, and tap **Connect Teams**. Sign in using a school account that belongs to classes and has permission to access assignments.
7. Tap **Save latest updates** and wait for the last-sync timestamp to change before disabling internet access. The offline list displays the last successful snapshot, not updates made after disconnection.
8. Enable reminders and optionally tap **Allow** beside the floating bubble. Grant overlay access in Android Settings, return to the planner, and tap **Show**.

## Scheduling and offline behavior

Android controls when background work runs. A 15-minute periodic interval is a minimum scheduling interval, not an exact polling deadline. Battery restrictions, Doze, force-stop, school token policies, and loss of connectivity can delay refreshes. Opening the app refreshes eligible stale data; an explicit sync request queues while offline and waits for an available network.

The app cannot predict when the user will turn off Wi-Fi or fetch new Teams data without internet. Manual sync plus the visible last-sync timestamp provides a reliable “save before going offline” workflow. Updates can also use mobile data; this implementation is not restricted to Wi-Fi.

Due-date reminders use the offline cache. They are approximate scheduled reminders rather than exact alarms. The floating service is user controlled, can be stopped using “Hide bubble” in its notification or panel, and is not automatically restarted after force-stop or reboot.

## Verification still needed with a registered school account

- Browser sign-in, cancellation, redirect and consent handling.
- Assignments and posts from actual school classes, including pagination and permission failures.
- Token refresh and revocation; switching and disconnecting accounts.
- Offline reads and edits; updates after reconnection without duplicate items.
- Device-specific background scheduling, notifications and overlay behavior.

## Official references

- [AppAuth for Android](https://github.com/openid/AppAuth-Android)
- [Microsoft assignment API](https://learn.microsoft.com/en-us/graph/api/educationuser-list-assignments?view=graph-rest-1.0)
- [Microsoft Graph permissions](https://learn.microsoft.com/en-us/graph/permissions-reference)
- [Joined Teams](https://learn.microsoft.com/en-us/graph/api/user-list-joinedteams?view=graph-rest-1.0)
- [Teams channel messages](https://learn.microsoft.com/en-us/graph/api/channel-list-messages?view=graph-rest-1.0)
- [Android WorkManager scheduling](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work)
