graph TD
    subgraph Dev A: Platform & Security
        A1[Database Schema & Migrations]
        A2[RLS Policy Configuration]
        A3[FastAPI Auth & JWT Local Verification]
        A4[Shopify Sync Webhook & HMAC]
        A5[Analytics Proxy: PostHog / Firebase]
        A6[Push Notifications Stub]
        A7[User Profiles CRM / Inventory]
    end

    subgraph Dev B: Recipe Engine & Features
        B1[Recipes & CMS Write APIs]
        B2[Ingredients & Steps CRUD]
        B3[Serving Size Adjuster & Fractions]
        B4[Likes, Bookmarks, Shares & Ratings]
        B5[Recommendation & Discovery Feeds]
        B6[In-App Purchase & Rewards Stubs]
        B7[RevenueCat Subscription Tiers]
    end

    A1 -->|Provides DB Tables| B1
    A2 -->|Secures Endpoints| B4
    A3 -->|Provides CurrentUser Auth Dependency| B2
