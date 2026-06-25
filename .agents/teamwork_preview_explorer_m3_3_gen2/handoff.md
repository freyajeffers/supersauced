# Handoff Report: Media Storage Pipeline & Directus Integration (Milestone 3)

## 1. Observation
During the investigation, the following files and content were analyzed:
* **`instructions.md`**:
  * Line 15: `"Media Storage: Cloudinary for optimized step-by-step videos; Supabase Storage for hero images."`
  * Line 109: `"Decoupled media storage by using Cloudinary for step videos and Supabase Storage for hero images, with URLs stored directly in the relational tables."`
* **`docs/cloudinary_integration.md`**:
  * Line 4: `"Cloudinary is used to store step‑by‑step cooking videos and any large media assets, while Supabase storage holds hero images."`
  * Line 17-23: Code configuring Cloudinary Node.js SDK using environment variables (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`).
* **`docs/content_workflow.md`**:
  * Contains several terminal escape code glitches:
    * Lines 117-118: `CLOU [45D [K` and `uploafetch(...)`
    * Lines 129-130: `upload [38D [K`
    * Lines 157-158: `Cloudinar [9D [K`
    * Lines 169-170: `Supabase. [9D [K`
    * Lines 174-177: `Pos [3D [K`, `and  [K`, `Stor [4D [K`, `con [3D [K`
    * Lines 183-186: `uploads [7D [K`, `a [1D [K`
    * Lines 188-189: `docu [4D [K`
    * Lines 194-195: `tailored  [K`
    * Lines 197-199: `[Sup [4D [K`, `directus.i [34D [K`
* **`.agents/explorer_m1_1/PRD_Mobile Recipe App_B2C.txt`**:
  * Line 317: `"Step Videos: Cloudinary -- all Guided Mode step videos hosted and delivered via Cloudinary CDN. Uploaded as MP4 (H.264, optimized for mobile)... Replace-without-URL-change workflow for seamless content updates."`
  * Line 318: `"Hero Images: Supabase Storage -- recipe hero images stored and delivered via Supabase CDN."`
  * Line 451: `"Cloudinary step video delivery is slow on poor mobile connections, breaking the Guided Mode experience ... Use Cloudinary's adaptive quality delivery. Preload the next step's video while the user is on the current step."`

---

## 2. Logic Chain
1. **Split-Media Pipeline Identification**: The media storage pipeline must decouple videos and images to optimize performance. Guided cooking step videos require high-bandwidth video optimization features (compression, transcoding, progressive download, adaptive streaming), making **Cloudinary** the optimal target. Static recipe hero images have lower rendering requirements and can leverage the free tiered storage and Cloudflare-backed CDN of **Supabase Storage**.
2. **Video Optimization Specifications**: The target format for step-by-step videos is standard H.264/AAC MP4 with progressive streaming capabilities. Mobile display uses vertical (9:16) or square (1:1) ratios (typically 720p or 1080p). Dynamic transformation query parameters (`f_auto`, `q_auto`, `vc_h264`) optimize file sizes. Stable Public IDs (`recipes/{recipe-slug}/steps/step-{step-number}`) are used to support updating videos without modifying database records.
3. **Hero Image Storage Specifications**: Supabase Storage requires a public bucket configuration (e.g. `recipe-hero-images`) and access control policies (anonymous SELECT, authenticated CRUD). HTTP headers (`Cache-Control: public, max-age=31536000, immutable`) ensure aggressive CDN edge caching.
4. **Directus CMS Integration**: Directus connects directly to the Supabase database bypassing RLS. Directus can use an S3-compatible storage driver to upload hero images directly to Supabase. Video integration is handled via URL fields pointing to Cloudinary or Directus hooks using the Cloudinary Node SDK. API tokens authenticate the client-CMS workflow.
5. **CDN Preloading Mechanics**: To avoid video stuttering on step changes in Guided Cooking, the React Native client preloads the next ($N+1$) and previous ($N-1$) video assets into a local disk cache. Small video sizes optimized via Cloudinary's dynamic parameters enable fast preloading.
6. **Proposed content_workflow.md Outlining**: The file `proposed_content_workflow_media_section.md` was drafted to contain the clean, corrected, and expanded documentation section, which the implementer can merge into `docs/content_workflow.md` to resolve the terminal escape glitches.

---

## 3. Caveats
* **Directus Extension Scope**: The direct storage adaptor code requires configuring AWS S3 driver variables on the Directus container environment. 
* **React Native / Expo assumptions**: Caching examples assume an Expo environment using `expo-av` and `expo-file-system`. Different cache behaviors will apply if native iOS/Android players are used.

---

## 4. Conclusion
The dual-storage media pipeline (Cloudinary and Supabase Storage) has been analyzed in detail along with Directus storage configurations and client-side preloading mechanics. A clean, updated, and corrected section of the documentation has been written to `/home/freya/supersauced/.agents/teamwork_preview_explorer_m3_3_gen2/proposed_content_workflow_media_section.md` to fix the glitches and add detail to the `content_workflow.md` file.

---

## 5. Verification Method
1. **File Inspection**: Verify that the file `proposed_content_workflow_media_section.md` exists and contains correct markdown, code snippets, and JSON/env configs.
2. **Path Verification**: Verify the table schema structures referenced inside `proposed_content_workflow_media_section.md` (`public.recipes` and `public.recipe_steps` in `docs/schema.sql`).
3. **Glitch Verification**: Check the line numbers cited in `docs/content_workflow.md` to verify that they contain terminal escape glitches which our proposed section resolves.
