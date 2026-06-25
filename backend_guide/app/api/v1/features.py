from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import List, Optional

try:
    from supabase import Client  # type: ignore
except Exception:

    class Client:  # type: ignore
        def __init__(self, *args, **kwargs):
            pass


from app.api.deps import get_user_client, get_current_user, get_service_client
from app.schemas.auth import CurrentUser
from app.schemas.recipe import Recipe
from app.schemas.like import Like
from app.schemas.bookmark import Bookmark
from app.schemas.share import Share
from app.schemas.rating import Rating, RatingCreate

router = APIRouter()


@router.get("/ping", summary="Health check for features module")
def ping() -> dict:
    """Simple health check endpoint to verify the features router is active.
    Returns a static JSON payload.
    """
    return {"message": "features endpoint reachable"}


# ---------------------------------------------------------------------------
# Search & Filters (Issue #3)
# ---------------------------------------------------------------------------
@router.get(
    "/search",
    response_model=List[Recipe],
    summary="Search recipes with optional tag filters and pagination",
)
def search_recipes(
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    cube_tags: Optional[str] = Query(None, description="Comma‑separated cube tags"),
    dietary_tags: Optional[str] = Query(
        None, description="Comma‑separated dietary tags"
    ),
    current_user: CurrentUser = Depends(get_current_user),
    user_client: Client = Depends(get_user_client),
) -> List[Recipe]:
    """Search recipes with optional tag filters.
    Supports pagination via `limit` and `offset`.
    """
    try:
        query = user_client.from_("recipes").select("*")
        if cube_tags:
            tags = [t.strip() for t in cube_tags.split(",") if t.strip()]
            if tags:
                query = query.contains("cube_tags", tags)
        if dietary_tags:
            tags = [t.strip() for t in dietary_tags.split(",") if t.strip()]
            if tags:
                query = query.contains("dietary_tags", tags)
        query = query.range(offset, offset + limit - 1)
        res = query.execute()
        return res.data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Search failed: {str(e)}"
        )


# ---------------------------------------------------------------------------
# Like / Heart Recipes (Issue #10)
# ---------------------------------------------------------------------------
@router.post(
    "/recipes/{recipe_id}/like",
    response_model=Like,
    status_code=status.HTTP_201_CREATED,
)
def like_recipe(
    recipe_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    user_client: Client = Depends(get_user_client),
) -> Like:
    """Create a like for the given recipe by the authenticated user."""
    try:
        data = {"user_id": current_user.id, "recipe_id": recipe_id}
        res = user_client.from_("likes").insert(data).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to like recipe"
            )
        return res.data[0]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Like failed: {str(e)}"
        )


@router.delete("/recipes/{recipe_id}/like", status_code=status.HTTP_204_NO_CONTENT)
def unlike_recipe(
    recipe_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    user_client: Client = Depends(get_user_client),
) -> None:
    """Remove a like for the given recipe by the authenticated user."""
    try:
        user_client.from_("likes").delete().eq("user_id", current_user.id).eq(
            "recipe_id", recipe_id
        ).execute()
        return None
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unlike failed: {str(e)}"
        )


@router.get(
    "/likes",
    response_model=List[Recipe],
    summary="List recipes liked by the current user",
)
def list_liked_recipes(
    current_user: CurrentUser = Depends(get_current_user),
    user_client: Client = Depends(get_user_client),
) -> List[Recipe]:
    """Return the full recipe objects that the current user has liked."""
    try:
        likes_res = (
            user_client.from_("likes")
            .select("recipe_id")
            .eq("user_id", current_user.id)
            .execute()
        )
        recipe_ids = [l["recipe_id"] for l in likes_res.data]
        if not recipe_ids:
            return []
        recipes_res = (
            user_client.from_("recipes").select("*").in_("id", recipe_ids).execute()
        )
        return recipes_res.data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to list liked recipes: {str(e)}",
        )


# ---------------------------------------------------------------------------
# Bookmark Recipes (Issue #9)
# ---------------------------------------------------------------------------
@router.post(
    "/recipes/{recipe_id}/bookmark",
    response_model=Bookmark,
    status_code=status.HTTP_201_CREATED,
)
def bookmark_recipe(
    recipe_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    user_client: Client = Depends(get_user_client),
) -> Bookmark:
    """Create a bookmark for the given recipe."""
    try:
        data = {"user_id": current_user.id, "recipe_id": recipe_id}
        res = user_client.from_("bookmarks").insert(data).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to bookmark recipe",
            )
        return res.data[0]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Bookmark failed: {str(e)}"
        )


@router.delete("/recipes/{recipe_id}/bookmark", status_code=status.HTTP_204_NO_CONTENT)
def unbookmark_recipe(
    recipe_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    user_client: Client = Depends(get_user_client),
) -> None:
    """Remove a bookmark for the given recipe."""
    try:
        user_client.from_("bookmarks").delete().eq("user_id", current_user.id).eq(
            "recipe_id", recipe_id
        ).execute()
        return None
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unbookmark failed: {str(e)}",
        )


@router.get(
    "/bookmarks",
    response_model=List[Recipe],
    summary="List bookmarked recipes for the current user",
)
def list_bookmarked_recipes(
    current_user: CurrentUser = Depends(get_current_user),
    user_client: Client = Depends(get_user_client),
) -> List[Recipe]:
    try:
        bm_res = (
            user_client.from_("bookmarks")
            .select("recipe_id")
            .eq("user_id", current_user.id)
            .execute()
        )
        ids = [b["recipe_id"] for b in bm_res.data]
        if not ids:
            return []
        recipes_res = user_client.from_("recipes").select("*").in_("id", ids).execute()
        return recipes_res.data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to list bookmarks: {str(e)}",
        )


# ---------------------------------------------------------------------------
# Nutrition & Macros (Issue #8)
# ---------------------------------------------------------------------------
@router.get(
    "/recipes/{recipe_id}/nutrition", summary="Get nutrition information for a recipe"
)
def get_nutrition(
    recipe_id: str,
    user_client: Client = Depends(get_user_client),
) -> dict:
    try:
        res = (
            user_client.from_("recipes")
            .select("calories_per_serving,protein_g,fat_g,carbs_g")
            .eq("id", recipe_id)
            .single()
            .execute()
        )
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found"
            )
        return res.data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nutrition fetch failed: {str(e)}",
        )


# ---------------------------------------------------------------------------
# Share Recipes (Issue #11)
# ---------------------------------------------------------------------------
@router.post(
    "/recipes/{recipe_id}/share",
    response_model=Share,
    status_code=status.HTTP_201_CREATED,
)
def share_recipe(
    recipe_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    user_client: Client = Depends(get_user_client),
) -> Share:
    try:
        data = {"user_id": current_user.id, "recipe_id": recipe_id}
        res = user_client.from_("shares").insert(data).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to record share"
            )
        return res.data[0]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Share failed: {str(e)}"
        )


# ---------------------------------------------------------------------------
# Recommendations (Issue #12)
# ---------------------------------------------------------------------------
@router.get(
    "/recipes/recommendations",
    response_model=List[Recipe],
    summary="Recommend recipes based on user likes",
)
def recommend_recipes(
    limit: int = Query(5, ge=1, le=20),
    current_user: CurrentUser = Depends(get_current_user),
    user_client: Client = Depends(get_user_client),
) -> List[Recipe]:
    """Very naive recommendation: fetch recipes sharing tags with any liked recipe.
    If the user has no likes, fall back to the most recent recipes.
    """
    try:
        likes_res = (
            user_client.from_("likes")
            .select("recipe_id")
            .eq("user_id", current_user.id)
            .execute()
        )
        liked_ids = [l["recipe_id"] for l in likes_res.data]
        if not liked_ids:
            recent = (
                user_client.from_("recipes")
                .select("*")
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            return recent.data
        liked_recipes = (
            user_client.from_("recipes")
            .select("cube_tags,dietary_tags")
            .in_("id", liked_ids)
            .execute()
        )
        tags = set()
        for r in liked_recipes.data:
            tags.update(r.get("cube_tags", []))
            tags.update(r.get("dietary_tags", []))
        if not tags:
            return []
        tag_str = ",".join(tags)
        rec_res = (
            user_client.from_("recipes")
            .select("*")
            .or_(f"cube_tags.cs.{{{tag_str}}},dietary_tags.cs.{{{tag_str}}}")
            .limit(limit)
            .execute()
        )
        return rec_res.data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Recommendation failed: {str(e)}",
        )


# ---------------------------------------------------------------------------
# Rating & Comments (Issue #13)
# ---------------------------------------------------------------------------
@router.post(
    "/recipes/{recipe_id}/rating",
    response_model=Rating,
    status_code=status.HTTP_201_CREATED,
)
def rate_recipe(
    recipe_id: str,
    rating: RatingCreate,
    current_user: CurrentUser = Depends(get_current_user),
    user_client: Client = Depends(get_user_client),
) -> Rating:
    try:
        data = {
            "user_id": current_user.id,
            "recipe_id": recipe_id,
            "rating": rating.rating,
            "comment": rating.comment,
        }
        res = user_client.from_("ratings").insert(data).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to submit rating",
            )
        return res.data[0]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Rating failed: {str(e)}"
        )


@router.get(
    "/recipes/{recipe_id}/ratings",
    response_model=List[Rating],
    summary="Get all ratings for a recipe",
)
def get_recipe_ratings(
    recipe_id: str,
    user_client: Client = Depends(get_user_client),
) -> List[Rating]:
    try:
        res = (
            user_client.from_("ratings")
            .select("*")
            .eq("recipe_id", recipe_id)
            .execute()
        )
        return res.data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to fetch ratings: {str(e)}",
        )


# ---------------------------------------------------------------------------
# Serving Size Adjuster (Issue #7)
# ---------------------------------------------------------------------------
@router.get(
    "/recipes/{recipe_id}/adjust-servings",
    summary="Adjust ingredient quantities for a new serving size",
)
def adjust_servings(
    recipe_id: str,
    target_servings: int = Query(..., ge=1, description="Desired number of servings"),
    user_client: Client = Depends(get_user_client),
) -> dict:
    """Return a map of ingredient IDs to scaled quantities based on target servings.
    The original `servings_default` is taken from the recipe record.
    """
    try:
        recipe_res = (
            user_client.from_("recipes")
            .select("servings_default")
            .eq("id", recipe_id)
            .single()
            .execute()
        )
        if not recipe_res.data or not recipe_res.data.get("servings_default"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Recipe missing default servings",
            )
        default_servings = recipe_res.data["servings_default"]
        factor = target_servings / default_servings
        ing_res = (
            user_client.from_("recipe_ingredients")
            .select("id,quantity,unit")
            .eq("recipe_id", recipe_id)
            .execute()
        )
        scaled = []
        for ing in ing_res.data:
            if ing.get("quantity") is not None:
                ing["scaled_quantity"] = round(ing["quantity"] * factor, 2)
            scaled.append(ing)
        return {"target_servings": target_servings, "ingredients": scaled}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Serving adjustment failed: {str(e)}",
        )


# Additional features (QR code, publishing, video upload, etc.) can be added here following the same pattern.

# ---------------------------------------------------------------------------
# QR Code & Web-to-App Handoff (Issue #14)
# ---------------------------------------------------------------------------
@router.get(
    "/{recipe_id}/qr",
    summary="Generate a QR code URL for a recipe",
)
def get_qr_code(
    recipe_id: str,
    user_client: Client = Depends(get_user_client),
) -> dict:
    """Return a placeholder URL that would point to the mobile app deep link.

    In a real implementation this would generate a QR image or a URL containing a
    custom scheme (e.g. `myapp://recipe/<id>`). For now we return a simple HTTPS
    URL that the frontend can turn into a QR code.
    """
    # Placeholder logic – in production this would be a signed, short‑lived URL
    return {"qr_url": f"https://app.supersauced.com/recipe/{recipe_id}"}

# ---------------------------------------------------------------------------
# Publishing & Unpublishing (Issue #17)
# ---------------------------------------------------------------------------
@router.post(
    "/{recipe_id}/publish",
    response_model=Recipe,
    status_code=status.HTTP_200_OK,
    summary="Publish a draft recipe",
)
def publish_recipe(
    recipe_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service_client: Client = Depends(get_service_client),
) -> Recipe:
    """Mark a recipe as published. Only editors can perform this action.

    The `recipes` table is expected to have an `is_published` boolean column.
    For now we simply set that field to true.
    """
    if current_user.role != "cms_editor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Requires cms_editor role.",
        )
    try:
        res = (
            service_client.from_("recipes")
            .update({"is_published": True})
            .eq("id", recipe_id)
            .execute()
        )
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Recipe not found or cannot be published.",
            )
        return res.data[0]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Publish failed: {str(e)}",
        )

@router.delete(
    "/{recipe_id}/publish",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unpublish a recipe",
)
def unpublish_recipe(
    recipe_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service_client: Client = Depends(get_service_client),
) -> None:
    """Mark a recipe as unpublished (draft).
    """
    if current_user.role != "cms_editor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Requires cms_editor role.",
        )
    try:
        service_client.from_("recipes").update({"is_published": False}).eq("id", recipe_id).execute()
        return None
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unpublish failed: {str(e)}",
        )

# ---------------------------------------------------------------------------
# Step Video Upload (Issue #18)
# ---------------------------------------------------------------------------
from fastapi import UploadFile, File

@router.post(
    "/{recipe_id}/video",
    summary="Upload a step‑by‑step video for a recipe",
    status_code=status.HTTP_201_CREATED,
)
def upload_step_video(
    recipe_id: str,
    video: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Accept a video file and return a placeholder URL.

    In a production system this would store the file in object storage and
    return the public URL. Here we simply echo the filename.
    """
    # Placeholder – no real storage performed
    return {"video_url": f"https://cdn.supersauced.com/videos/{recipe_id}/{video.filename}"}

# ---------------------------------------------------------------------------
# Tagging & Categorization (Issue #19)
# ---------------------------------------------------------------------------
@router.post(
    "/{recipe_id}/tags",
    summary="Add or replace tags for a recipe",
    response_model=Recipe,
)
def set_recipe_tags(
    recipe_id: str,
    tags: List[str],
    current_user: CurrentUser = Depends(get_current_user),
    service_client: Client = Depends(get_service_client),
) -> Recipe:
    """Replace a recipe's `cube_tags` and `dietary_tags` with the provided list.
    """
    if current_user.role != "cms_editor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Requires cms_editor role.",
        )
    try:
        # For simplicity we treat the incoming list as cube_tags; a real system
        # would distinguish categories.
        res = (
            service_client.from_("recipes")
            .update({"cube_tags": tags})
            .eq("id", recipe_id)
            .execute()
        )
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Recipe not found.",
            )
        return res.data[0]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tag update failed: {str(e)}",
        )

# ---------------------------------------------------------------------------
# Admin Analytics Dashboard (Issue #20)
# ---------------------------------------------------------------------------
@router.get(
    "/admin/analytics",
    summary="Basic analytics for admin dashboard",
    tags=["Admin"],
)
def admin_analytics(
    admin_user: CurrentUser = Depends(get_current_user),
    service_client: Client = Depends(get_service_client),
) -> dict:
    """Return simple counts for recipes, users, likes, and bookmarks.
    Access is restricted to admin role.
    """
    if admin_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    try:
        recipes_cnt = service_client.from_("recipes").select("id", count="exact").execute().count
        users_cnt = service_client.from_("user_profiles").select("id", count="exact").execute().count
        likes_cnt = service_client.from_("likes").select("id", count="exact").execute().count
        bookmarks_cnt = service_client.from_("bookmarks").select("id", count="exact").execute().count
        return {
            "recipes": recipes_cnt,
            "users": users_cnt,
            "likes": likes_cnt,
            "bookmarks": bookmarks_cnt,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Analytics fetch failed: {str(e)}",
        )

# ---------------------------------------------------------------------------
# Discovery Mode (Issue #21)
# ---------------------------------------------------------------------------
@router.get(
    "/discover",
    summary="Discover recipes tailored to the user",
    response_model=List[Recipe],
)
def discover_recipes(
    limit: int = Query(10, ge=1, le=50),
    current_user: CurrentUser = Depends(get_current_user),
    user_client: Client = Depends(get_user_client),
) -> List[Recipe]:
    """Very naive discovery: return the most recent recipes the user hasn't liked yet.
    """
    try:
        liked_res = (
            user_client.from_("likes")
            .select("recipe_id")
            .eq("user_id", current_user.id)
            .execute()
        )
        liked_ids = [r["recipe_id"] for r in liked_res.data]
        query = user_client.from_("recipes").select("*")
        if liked_ids:
            query = query.not_("id", "in", liked_ids)
        recent = query.order("created_at", desc=True).limit(limit).execute()
        return recent.data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Discovery failed: {str(e)}",
        )

# ---------------------------------------------------------------------------
# Push Notifications (Issue #22)
# ---------------------------------------------------------------------------
from pydantic import BaseModel

class NotificationCreate(BaseModel):
    user_id: str
    title: str
    body: str

@router.post(
    "/notifications",
    summary="Send a push notification to a user (stub)",
    status_code=status.HTTP_202_ACCEPTED,
)
def send_notification(
    payload: NotificationCreate,
    admin_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Placeholder endpoint – in a real system this would enqueue a message to
    Firebase or APNs. Here we simply echo the payload.
    """
    if admin_user.role not in {"admin", "cms_editor"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to send notifications.",
        )
    # No actual sending – just acknowledge
    return {"queued": True, "target_user": payload.user_id}

# ---------------------------------------------------------------------------
# Community / Social Feed (Issue #25)
# ---------------------------------------------------------------------------
@router.get(
    "/feed",
    summary="Community feed mixing recent likes, bookmarks and comments",
    response_model=List[dict],
)
def community_feed(
    limit: int = Query(20, ge=1, le=100),
    user_client: Client = Depends(get_user_client),
) -> List[dict]:
    """Combine recent activity into a simple feed. This is a stub returning a list of
    placeholder events.
    """
    # In a real implementation we'd query an activity table. Here we fabricate.
    return [
        {"type": "like", "user_id": "user123", "recipe_id": "rec456", "timestamp": "2023-01-01T12:00:00Z"},
        {"type": "comment", "user_id": "user789", "recipe_id": "rec012", "comment": "Great recipe!", "timestamp": "2023-01-02T08:30:00Z"},
    ][:limit]

# ---------------------------------------------------------------------------
# Ingredient Substitution Suggestions (Issue #28)
# ---------------------------------------------------------------------------
@router.get(
    "/ingredients/{ingredient_id}/substitutes",
    summary="Get substitution suggestions for an ingredient",
    response_model=List[str],
)
def ingredient_substitutes(
    ingredient_id: str,
    user_client: Client = Depends(get_user_client),
) -> List[str]:
    """Return a static list of possible substitutes. In production this would query
    a knowledge base or external API.
    """
    # Placeholder static map
    substitutes_map = {
        "egg": ["flaxseed", "chia seed", "applesauce"],
        "butter": ["coconut oil", "olive oil", "margarine"],
    }
    return substitutes_map.get(ingredient_id.lower(), [])

# ---------------------------------------------------------------------------
# Rewards / Loyalty Program (Issue #29)
# ---------------------------------------------------------------------------
@router.get(
    "/rewards/{user_id}",
    summary="Get loyalty points for a user",
    response_model=dict,
)
def get_rewards(
    user_id: str,
    admin_user: CurrentUser = Depends(get_current_user),
    user_client: Client = Depends(get_user_client),
) -> dict:
    """Stub endpoint – returns a fake points balance.
    """
    if admin_user.role not in {"admin", "cms_editor"} and admin_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Can only view your own rewards.",
        )
    # Placeholder static balance
    return {"user_id": user_id, "points": 1234}

# ---------------------------------------------------------------------------
# DTC Purchasing / In‑App Commerce (Issue #30)
# ---------------------------------------------------------------------------
@router.post(
    "/purchase",
    summary="Create a purchase order for a recipe or ingredient pack",
    status_code=status.HTTP_201_CREATED,
)
def create_purchase(
    item_id: str,
    quantity: int = 1,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Stub purchase creation – in a real system this would integrate with Stripe or
    Apple/Google payments. Here we return a mock order ID.
    """
    return {"order_id": f"ORD-{current_user.id[:4]}-{item_id[:4]}", "status": "pending"}

# ---------------------------------------------------------------------------
# Premium Subscription Tier (Issue #31)
# ---------------------------------------------------------------------------
@router.get(
    "/subscription/status",
    summary="Retrieve the current user's subscription tier",
    response_model=dict,
)
def subscription_status(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Stub response – assume a free tier for all users.
    """
    # In production this would query RevenueCat or another subscription provider.
    return {"user_id": current_user.id, "tier": "free"}

@router.post(
    "/subscription/upgrade",
    summary="Upgrade the current user to a premium tier",
    status_code=status.HTTP_200_OK,
)
def upgrade_subscription(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Stub upgrade – simply acknowledge. Real implementation would handle payment.
    """
    # Placeholder – no real upgrade performed.
    return {"user_id": current_user.id, "new_tier": "premium", "status": "upgraded"}

# ---------------------------------------------------------------------------
# AI‑Powered Personalized Recommendations (Issue #26)
# ---------------------------------------------------------------------------
# The simple recommendation endpoint above already provides a naive version.
# For a true AI‑powered approach we would integrate with an LLM or ML model.
# This stub is left as an exercise for future work.

# ---------------------------------------------------------------------------
# Hands‑Free Voice Navigation (Issue #27)
# ---------------------------------------------------------------------------
@router.get(
    "/{recipe_id}/guided",
    summary="Provide step‑by‑step voice instructions for a recipe",
    response_model=List[dict],
)
def guided_voice_instructions(
    recipe_id: str,
    user_client: Client = Depends(get_user_client),
) -> List[dict]:
    """Return a list of steps with text that could be fed to a TTS engine.
    """
    try:
        steps_res = (
            user_client.from_("recipe_steps")
            .select("step_number,description")
            .eq("recipe_id", recipe_id)
            .order("step_number")
            .execute()
        )
        return [
            {"step": s["step_number"], "instruction": s["description"]}
            for s in steps_res.data
        ]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to fetch guided instructions: {str(e)}",
        )

