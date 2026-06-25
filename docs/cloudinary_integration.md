# Cloudinary Integration

## Overview

This document describes how to integrate **Cloudinary** for video and image assets within the Super Sauced backend. Cloudinary is used to store step‑by‑step cooking videos and any large media assets, while Supabase storage holds hero images.

## Prerequisites

> [!NOTE]
> **Prerequisites**
>
> - Cloudinary account (free tier is sufficient for development)
> - API credentials: Cloud name, API key, API secret

- Cloudinary account (free tier is sufficient for development).
- API credentials: **Cloud name**, **API key**, **API secret**.

## Setup

1. Install the Cloudinary Node.js SDK in your backend (if using server‑side code):

   ```bash
   npm install cloudinary
   ```

2. Create a `cloudinary.js` helper module:

   ```javascript
   const cloudinary = require('cloudinary').v2;
   cloudinary.config({
     cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
     api_key: process.env.CLOUDINARY_API_KEY,
     api_secret: process.env.CLOUDINARY_API_SECRET,
   });
   module.exports = cloudinary;
   ```

3. Add the environment variables to your deployment configuration (e.g., Supabase Edge Functions, Vercel, Netlify).

## Upload Flow

When a content author adds a video in Directus:

1. The file is uploaded to Cloudinary via the SDK.
2. The returned `secure_url` is stored in the `media_assets` table in Supabase:

   ```javascript
   const { data, error } = await supabase
     .from('media_assets')
     .insert({
       name: file.originalname,
       url: result.secure_url,
       public_id: result.public_id,
       type: 'video',
     });
   ```

3. The `url` can then be used by the mobile app to stream the video.

## Deleting Assets

```javascript
await cloudinary.uploader.destroy(publicId);
await supabase.from('media_assets').delete().eq('public_id', publicId);
```

## Security Considerations

- Keep API secret out of client bundles; use server‑side functions.
- Set appropriate upload presets in Cloudinary to enforce size limits and formats.

## References

- Cloudinary docs: <https://cloudinary.com/documentation>
- Cloudinary Node SDK: <https://github.com/cloudinary/cloudinary_npm>
