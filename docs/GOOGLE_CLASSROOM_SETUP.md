# Google Classroom demo setup

Google Classroom needs internet for registration, consent, and downloading new data. Saved assignments, announcements, checklists, and due dates are then available offline. The native bubble also reads that cache without Metro or the AI model running.

## 1. Use one Google Cloud project

Open [Google Cloud Console](https://console.cloud.google.com/), sign in, and select the project where you enabled **Google Classroom API**. The project can be named Assignment Tracker, Backpack Tutor, or another name; the API and Android OAuth client must be configured in the same project.

## 2. Configure the app's audience

Open [Google Auth Platform](https://console.cloud.google.com/auth/overview). If it has not been initialized, choose **Get started**, enter **Backpack Tutor**, your support email and contact email, and choose **External** for a personal-account demo. If already initialized, edit those app details under **Branding**.

Open **Audience**. Keep **External / Testing** for the demo. Under **Test users**, choose **Add users**, enter the Gmail accounts that will connect from the phone, and save. Do not publish the app merely to run this demo. If the project uses an internal school audience, only accounts permitted by that organization can use it.

## 3. Add read-only scopes

Open **Data access → Add or remove scopes**. Select or manually add:

```text
https://www.googleapis.com/auth/classroom.courses.readonly
https://www.googleapis.com/auth/classroom.coursework.me.readonly
https://www.googleapis.com/auth/classroom.announcements.readonly
```

Update and save. These request reading courses, the student's coursework, and announcements. The app does not modify Classroom, submit assignments, or post announcements. A school may restrict third-party apps even with read-only scopes. User consent is still required.

## 4. Register this Android build

Open **Clients → Create client**. Choose **Android** and enter:

- Name: `Backpack Tutor Android demo`
- Package: `com.backpacktutor`
- SHA-1 for the current debug build:

```text
5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25
```

This fingerprint was read from `android/app/debug.keystore`. Register the appropriate signing fingerprint again when using a different release key or Google Play app signing.

Copy the Android OAuth **client ID**, which ends with `.apps.googleusercontent.com`, into `googleAndroidClientId` in `src/config/schoolAgent.ts`. Do not create a Web client or ship a client secret for this phone-only authorization flow. Google Play services associates the authorization request with the registered package and signing certificate; the saved ID marks the configuration as ready in the app.

No `google-services.json` or Firebase setup is needed for this implementation.

## 5. Connect a student account

Use an account enrolled as a **student** in at least one active Classroom course with published coursework and announcements. For a personal demo, a separate account can create the class and invite the student account. A teacher-only account will not produce the student assignment list in this implementation.

Reload the updated Android app after adding the client ID. Open **Home gear → Study planner → Google Classroom → Connect Classroom**, choose the account, and consent to read access. The consent screen uses Google Play services, not an embedded WebView.

Tap **Save latest updates** and wait for the last-sync timestamp to change before going offline. Cached tasks and announcements remain available. Task checkboxes are local checklist state, not Classroom submission status. Attachment contents are not downloaded; external links may need internet.

## 6. Enable the floating bubble

In Study planner, tap **Allow** beside Floating to-do bubble. Grant Android's **Display over other apps** access, return to the planner and tap **Show**. Tap the bubble to expand the cached list; drag it to move it. The service can remain after leaving the main app, but Android force-stop, reboot, permission removal, or manufacturer battery policies may stop it. Enable it again from the planner when needed.

The bubble is independent of internet, Google Classroom login, and local AI inference. Manual tasks are enough to use it before any school connection is configured.

## Implementation and scheduling

The Android app uses Google Identity Services `AuthorizationClient`. Short-lived access tokens remain in native memory and Google's managed token cache; they are not passed to JavaScript or stored in the ordinary task database. Background requests authorize the chosen account again with the same read-only scopes. If Google requires new consent, the worker leaves cached data intact and reports that the account needs reconnecting.

Coursework and announcement lists follow page tokens. Assignment snapshots are committed only after the course/assignment fetch completes. A denied announcements scope is reported without discarding a successful assignment snapshot. At most 500 cached announcements are retained.

Background refresh uses Android WorkManager and available internet, including mobile data. Android can delay refreshes; the periodic interval is not an exact deadline. Reminders use a separate network-independent worker. The app cannot download new posts after disconnection or predict when Wi-Fi will be turned off.

Live sign-in, consent, account switching, token renewal, actual course data, and device-specific background behavior still need verification with a configured account.

## Official references

- [Google authorization for Android](https://developer.android.com/identity/authorization)
- [Classroom OAuth scopes](https://developers.google.com/workspace/classroom/guides/auth)
- [Coursework for students](https://developers.google.com/workspace/classroom/guides/manage-coursework)
- [Classroom coursework API](https://developers.google.com/workspace/classroom/reference/rest/v1/courses.courseWork/list)
- [Classroom announcements API](https://developers.google.com/workspace/classroom/reference/rest/v1/courses.announcements/list)
