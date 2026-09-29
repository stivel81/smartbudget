# smartbudget

## Mobile e2e tests (Maestro)

End-to-end flows for the iOS app live in `apps/mobile/.maestro/` and run in Expo Go
on a booted iOS Simulator against the running Metro (8081) and backend (3000).

One-time setup:

```bash
brew tap mobile-dev-inc/tap && brew install mobile-dev-inc/tap/maestro   # needs Java 17+
cp apps/mobile/.maestro/.env.example apps/mobile/.maestro/.env.local   # gitignored; fill in the test account
```

Run (from `apps/mobile`):

```bash
npm run e2e                               # default suite: login, dashboard, budget, settings, signout
npm run e2e -- --scan .maestro/scan.yaml  # scan flow only: real Claude call, adds a receipt to the account
npm run e2e -- --record /tmp/e2e.mp4      # also record a simulator video
npm run e2e -- .maestro/login.yaml        # a single flow
```

Each flow starts by relaunching Expo Go (`exp://127.0.0.1:8081`) and signing in or out as it
needs, so flows run in any order. The launch step switches off Expo Go's floating "Tools
button", which otherwise covers in-app buttons; turn it back on from the Expo dev menu (Cmd+D).
The scan flow picks the newest photo in the simulator's library, so add one first with
`xcrun simctl addmedia booted <receipt.jpg>`. Maestro keeps run logs under `~/.maestro/tests/`,
and those logs include the env values, so treat that folder as sensitive.
