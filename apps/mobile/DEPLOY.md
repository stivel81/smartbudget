# Mobile builds and releases (EAS)

Local development is unchanged: `npx expo start` in this folder, and the app talks to
`http://localhost:3000` (see "Backend URL" below). Everything else here is for EAS builds.

## Backend URL

The app reads the backend address from `EXPO_PUBLIC_API_BASE_URL` (`lib/config.ts`). The value is
inlined into the JS bundle when it is built, so changing it means a new build (or an EAS Update
published with the new value).

| Build                                   | Variable unset                 | Variable set                   |
| --------------------------------------- | ------------------------------ | ------------------------------ |
| Dev (`__DEV__`: Metro, Expo Go, dev client) | `http://localhost:3000`        | the value                      |
| Preview / production                    | startup error screen           | the value                      |

- The value must be an absolute `http(s)` URL with no query or fragment. Trailing slashes are
  removed. An invalid value shows the startup error screen in any build, dev included.
- A value that still contains `REPLACE_ME` (the eas.json placeholders) also shows the error
  screen, so a build made before the real URLs are filled in can't start pointing at nowhere.
- The error screen appears instead of the app. No request is sent anywhere; in particular a
  release build never falls back to localhost.
- Locally, set it in `.env.local` (see `.env.example`), e.g. `http://10.0.2.2:3000` for the
  Android emulator or your LAN IP for a physical phone. Restart Metro after changing it.

## Build profiles (`eas.json`)

| Profile       | Purpose                              | Distribution          | EAS Update channel | `EXPO_PUBLIC_API_BASE_URL`   |
| ------------- | ------------------------------------ | --------------------- | ------------------ | ---------------------------- |
| `development` | dev client for the team              | internal (ad hoc/APK) | `dev`              | `https://api-dev.REPLACE_ME` |
| `preview`     | staging (stg) testers                | internal; Android APK | `staging`          | `https://api-stg.REPLACE_ME` |
| `production`  | App Store / Play Store               | store                 | `production`       | `https://api.REPLACE_ME`     |

`production` auto-increments the build number (`appVersionSource: "remote"`, so EAS keeps the
iOS build number and Android version code). The marketing version is `expo.version` in `app.json`.

## To fill in before the first build

1. **Backend URLs**: replace the three `REPLACE_ME` URLs in `eas.json` with the real dev, staging
   and production API URLs. Use https everywhere except local dev. iOS blocks plain http
   (App Transport Security), and Android release builds block cleartext traffic.
2. **Expo account and project id**: `npm i -g eas-cli`, then `eas login` and `eas init` in this
   folder. `eas init` creates the EAS project and writes `expo.extra.eas.projectId` (and
   `expo.owner`) into `app.json`. Commit that change. The project id is intentionally not in the
   repo yet.
3. **Native packages**: install the modules the profiles rely on (this updates the root
   `package-lock.json`):
   ```bash
   npx expo install expo-dev-client expo-updates   # dev client for `development`, OTA updates
   eas update:configure                            # adds expo.updates.url from the project id
   ```
   Local development and Maestro keep running in Expo Go either way.
4. **Bundle identifier / package**: `app.json` has `ios.bundleIdentifier` and `android.package`
   set to `com.smartbudget.app`. **This is a placeholder. Confirm it (it must be a reverse domain
   you control and unique on the stores) before the first store build.** It can't be changed
   after the app is published.
5. **Store accounts**: store builds and `eas submit` need an **Apple Developer Program**
   membership (paid, yearly) and a **Google Play Console** account (one-time fee). Neither
   exists yet. Internal `preview`/`development` builds on Android need no store account. iOS
   internal builds still need an Apple developer account for signing and must register each
   test device (`eas device:create`).

## Commands (after the steps above)

```bash
eas build --profile development --platform ios      # or android / all
eas build --profile preview --platform all          # stg testers
eas build --profile production --platform all       # store binaries
eas submit --profile production --platform ios      # needs the Apple account

# OTA JS-only update to builds of the same app version (runtimeVersion policy "appVersion").
# Pass the matching URL: an update is bundled from your machine, and eas.json's build env
# does not apply to `eas update`.
EXPO_PUBLIC_API_BASE_URL=https://api-stg.example.com eas update --channel staging --message "..."
```

`runtimeVersion` follows `expo.version`, so an update only reaches builds with the same app
version. Bump `expo.version` whenever native code or config changes (new native module, permission,
plugin), and ship a new build for it rather than an update.
