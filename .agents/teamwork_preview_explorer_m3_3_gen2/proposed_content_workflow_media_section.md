# Proposed Content Workflow Section: Media Storage Pipeline & Directus Integration

This section details the configuration, specifications, and integration mechanics for the dual-storage media pipeline.

---

## 1. Media Asset Pipeline Overview
To achieve the "Speed to Meal" performance requirement and ensure a seamless cooking experience, the media pipeline is decoupled:
* **Step-by-Step Cooking Videos (Guided Cooking)**: Managed and streamed via **Cloudinary CDN** to support adaptive quality, automatic compression, and fast progressive download.
* **Recipe Hero Images**: Stored in a public **Supabase Storage** bucket, leveraged via Supabase's built-in CDN (Cloudflare) for cost-efficiency and fast delivery.

```
                  ┌─────────────────┐
                  │  Directus CMS   │
                  └────────┬────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
 ┌──────────────────────┐    ┌──────────────────────┐
 │  Supabase Storage    │    │    Cloudinary CDN    │
 │ (S3-Compatible App)  │    │ (Media Integration)  │
 ├──────────────────────┤    ├──────────────────────┤
 │  • Recipe Hero       │    │  • Guided Cooking    │
 │    Images            │    │    Step Videos       │
 │  • Public Bucket     │    │  • MP4 (H.264)       │
 │  • Max 5MB, WebP/JPG │    │  • f_auto, q_auto    │
 └───────────┬──────────┘    └───────────┬──────────┘
             │                           │
             └─────────────┬─────────────┘
                           ▼
                 ┌──────────────────┐
                 │ Mobile App (iOS) │
                 └──────────────────┘
```

---

## 2. Media Specifications & Configurations

### A. Cloudinary Video Specifications
To ensure cooking videos start playing in under 3 seconds in Guided Mode, all video assets must comply with the following standards:

| Property | Specification | Rationale |
|---|---|---|
| **Format & Container** | `MP4` (with progressive download support) and `HLS` (`.m3u8` playlist) for adaptive streaming. | Ensures instant playback start and smooth buffering on mobile networks. |
| **Video Codec** | H.264 (AVC) - Main Profile, Level 4.1. | Universal hardware decoding on iOS and Android. |
| **Audio Codec** | AAC-LC (Stereo, 48kHz, 128kbps). | High compatibility, low overhead. |
| **Resolution** | 720p preferred (`720x1280` vertical or `720x720` square). Max `1080p`. | Optimized for vertical device screens and minimizes data usage. |
| **Maximum File Size** | 10 MB per step video. | Prevents excessive memory use and bandwidth issues. |
| **Public ID Convention** | `recipes/{recipe-slug}/steps/step-{step-number}` | Enables "replace-without-URL-change" workflow to update videos without changing DB records. |

#### Cloudinary CDN Optimization URL Parameter Configuration:
Mobile applications must request videos using optimized dynamic transformation parameters:
* `f_auto`: Automatically serves the best format (e.g., WebM for Android, MP4/HEVC for iOS).
* `q_auto`: Automatically optimizes compression levels on the fly to reduce file size without losing visual quality.
* `vc_h264`: Enforces the H.264 codec.
* **Example URL**: `https://res.cloudinary.com/your-cloud-name/video/upload/f_auto,q_auto,vc_h264/recipes/classic-marinara/steps/step-1.mp4`

---

### B. Supabase Storage Configurations
Recipe hero images are stored in a public Supabase Storage bucket.

* **Bucket Name**: `recipe-hero-images`
* **Access Level**: Public (Read access is granted to all anonymous traffic).
* **Allowed Content Types**: `image/jpeg`, `image/png`, `image/webp`.
* **Max File Size**: 5 MB.
* **CDN Caching Header**: `Cache-Control: public, max-age=31536000, immutable` to force Cloudflare CDN edge caching.

---

## 3. Directus Integration & Settings

### A. Database Connection & API Tokens
1. **DB Sync**: Directus connects to the Supabase PostgreSQL database using a direct connection string. RLS is bypassed for Directus operations using admin-level credentials, ensuring that Directus can write to the `public.recipes` and `public.recipe_steps` tables.
2. **API Access**: 
   - A static bearer token (`DIRECTUS_KEY`) is generated in Directus settings and assigned to the integration role.
   - The React Native mobile client interacts directly with Supabase via PostgREST to fetch recipe metadata (leveraging GIN indexes and RLS), while Directus remains the write-only source of truth for the content team.

### B. Supabase Storage Adaptor in Directus
Directus is configured to write files directly to the Supabase Storage bucket by utilizing the S3 storage driver in `.env`:

```bash
# Directus Storage Configuration for Supabase
STORAGE_LOCATIONS="supabase"
STORAGE_SUPABASE_DRIVER="s3"
STORAGE_SUPABASE_KEY="your-supabase-service-role-key"
STORAGE_SUPABASE_SECRET="your-supabase-service-role-key"
STORAGE_SUPABASE_BUCKET="recipe-hero-images"
STORAGE_SUPABASE_ENDPOINT="https://your-supabase-project.supabase.co/storage/v1/s3"
STORAGE_SUPABASE_REGION="us-east-1"
STORAGE_SUPABASE_ROOT="/"
```

### C. Cloudinary Video Asset Linkage in Directus
Because Cloudinary is dedicated to video optimization and delivery:
1. **Direct Input Linkage**: Content creators upload step videos to Cloudinary. In Directus, the `recipe_steps` collection includes a Text field `video_url` where authors paste the generated Cloudinary CDN URL.
2. **Automated Upload Hook (Optional)**: A Directus Flow or custom extension can automate this. When an editor uploads an MP4 file, an event hook transmits it to Cloudinary using the SDK:
   ```javascript
   const cloudinary = require('cloudinary').v2;
   cloudinary.config({
     cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
     api_key: process.env.CLOUDINARY_API_KEY,
     api_secret: process.env.CLOUDINARY_API_SECRET,
   });

   // Directus event handler for media uploads
   module.exports = ({ action }) => {
     action('files.upload', async ({ payload, accountability }) => {
       if (payload.type.startsWith('video/')) {
         const uploadResult = await cloudinary.uploader.upload(payload.filepath, {
           resource_type: "video",
           folder: "recipes",
           use_filename: true,
           unique_filename: true
         });
         
         // Store uploadResult.secure_url back into Directus/Supabase schema
       }
     });
   };
   ```

---

## 4. CDN Preloading Mechanics for Guided Cooking

To prevent latency stalls during the Guided Cooking user journey, the React Native application implements an active preloading queue.

### A. Sliding Window Preload Strategy
While the user is currently interacting with Step $N$, the application schedules the preloading of assets for adjacent steps.
* **Step $N$ (Active)**: Video plays immediately from the cached stream.
* **Step $N+1$ (Preloaded)**: App downloads the video file to the local cache folder.
* **Step $N-1$ (Preloaded)**: App ensures the previous video remains in the cache in case the user navigates backward.

```
       [Step N-1] <=====> [Step N] <=====> [Step N+1]
      (Preloaded)         (Active)        (Preloaded)
```

### B. Preloading Code (React Native + expo-av)
The client cache manager controls video preloading as the active step transitions:

```typescript
import { Video } from 'expo-av';
import * as FileSystem from 'expo-file-system';

interface PreloadQueue {
  currentUrl: string;
  nextUrl?: string;
  prevUrl?: string;
}

export class VideoCacheManager {
  private static cacheDir = `${FileSystem.cacheDirectory}video-cache/`;

  // Ensures caching directory exists
  public static async init() {
    const dirInfo = await FileSystem.getInfoAsync(this.cacheDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(this.cacheDir, { intermediates: true });
    }
  }

  // Preloads a video to local disk cache
  public static async preloadVideo(url: string): Promise<string> {
    if (!url) return '';
    const filename = encodeURIComponent(url);
    const localUri = `${this.cacheDir}${filename}`;

    const fileInfo = await FileSystem.getInfoAsync(localUri);
    if (fileInfo.exists) {
      return localUri; // Return local cache URI
    }

    try {
      // Download the asset in the background
      const downloadRes = await FileSystem.downloadAsync(url, localUri);
      return downloadRes.uri;
    } catch (error) {
      console.warn("Failed to preload video:", error);
      return url; // Fallback to live URL if download fails
    }
  }

  // Updates the active sliding window queue
  public static async updateQueue(queue: PreloadQueue) {
    if (queue.nextUrl) {
      this.preloadVideo(queue.nextUrl); // Fire and forget
    }
    if (queue.prevUrl) {
      this.preloadVideo(queue.prevUrl); // Fire and forget
    }
  }
}
```
