# Build & Deployment

<!-- toc -->

## Overview

The Super Sauced MVP uses **Expo Application Services (EAS)** for the React Native mobile app and **Vercel** for the Next.js web app. Both services provide managed CI/CD pipelines, over‑the‑air (OTA) updates, and zero‑config builds.

## Mobile: EAS Build & Submit

| Step | Command | Description |
| ------ | --------- | ------------- |
| **1️⃣ Install EAS CLI** | `npm install -g eas-cli` | Global install of the EAS command‑line client. |
| **2️⃣ Login** | `eas login` | Authenticates you with your Expo account. |
| **3️⃣ Configure** | `eas build:configure` | Generates an `eas.json` with the `production` profile (Android + iOS). |
| **4️⃣ Build** | `eas build --profile production --platform ios`<br>`eas build --profile production --platform android` | Sends the project to Expo’s build farm. Artifacts are uploaded to the App Store Connect / Google Play consoles. |
| **5️⃣ Submit** | `eas submit --platform ios`<br>`eas submit --platform android` | Automatically uploads the built binaries to the respective stores (requires store credentials). |
| **6️⃣ OTA Updates** | `eas update --channel production` | Pushes JavaScript bundle & assets to Expo’s CDN; users get the update instantly without reinstalling the native binary. |

### EAS Configuration (`eas.json`)

```json
{
  "cli": {"version": ">= 3.0.0"},
  "build": {
    "production": {
      "ios": {"workflow": "managed"},
      "android": {"workflow": "managed"}
    }
  }
}
```

## Web: Vercel Deploy

| Step | Command / Action | Description |
| ------ | ------------------ | ------------- |
| **1️⃣ Install Vercel CLI** | `npm i -g vercel` | Global install of Vercel.
| **2️⃣ Login** | `vercel login` | Authenticate with your Vercel account.
| **3️⃣ Deploy** | `vercel --prod` | Deploys the Next.js site to a Vercel production domain. |
| **4️⃣ Preview** | `vercel` | Creates a preview URL for each pull request/branch. |
| **5️⃣ Environment Variables** | Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` etc. in the Vercel dashboard. |

## Continuous Integration

Both EAS and Vercel integrate with GitHub Actions. Example snippets are provided in the repository’s `.github/workflows/` directory (not shown here).

---

*Keep the `eas.json` and Vercel environment configuration in sync with any new env‑variables introduced in the codebase.*
