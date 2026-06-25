from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status

try:
    from supabase import Client
except Exception:

    class Client:  # type: ignore
        def __init__(self, *args, **kwargs):
            pass


from app.api.deps import get_user_client, get_service_client, get_current_user
from app.schemas.auth import CurrentUser
from app.schemas.recipe import Recipe, RecipeCreate, RecipeUpdate

router = APIRouter()


@router.get("", response_model=List[Recipe])
def list_recipes(
    limit: int = 10,
    offset: int = 0,
    cube_tags: Optional[str] = None,
    dietary_tags: Optional[str] = None,
    current_user: CurrentUser = Depends(get_current_user),
    user_client: Client = Depends(get_user_client),
):
    """
    List recipes with optional filtering and pagination.
    Uses the user-scoped client.
    """
    try:
        query = user_client.from_("recipes").select("*")

        if cube_tags:
            tags_list = [t.strip() for t in cube_tags.split(",") if t.strip()]
            if tags_list:
                query = query.contains("cube_tags", tags_list)

        if dietary_tags:
            tags_list = [t.strip() for t in dietary_tags.split(",") if t.strip()]
            if tags_list:
                query = query.contains("dietary_tags", tags_list)

        query = query.range(offset, offset + limit - 1)
        res = query.execute()
        return res.data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to list recipes: {str(e)}",
        )


@router.get("/{id}", response_model=Recipe)
def get_recipe(
    id: str,
    current_user: CurrentUser = Depends(get_current_user),
    user_client: Client = Depends(get_user_client),
):
    """
    Get a single recipe by ID.
    Uses the user-scoped client.
    """
    try:
        res = user_client.from_("recipes").select("*").eq("id", id).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Recipe not found or access denied.",
            )
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to fetch recipe: {str(e)}",
        )


@router.post("", response_model=Recipe, status_code=status.HTTP_201_CREATED)
def create_recipe(
    body: RecipeCreate,
    current_user: CurrentUser = Depends(get_current_user),
    service_client: Client = Depends(get_service_client),
):
    """
    Create a new recipe.
    Requires cms_editor role. Uses service-role client.
    """
    if current_user.role != "cms_editor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Requires cms_editor role.",
        )

    try:
        insert_data = body.model_dump()
        res = service_client.from_("recipes").insert(insert_data).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to create recipe.",
            )
        return res.data[0]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create recipe: {str(e)}",
        )


@router.put("/{id}", response_model=Recipe)
def update_recipe(
    id: str,
    body: RecipeUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    service_client: Client = Depends(get_service_client),
):
    """
    Update a recipe.
    Requires cms_editor role. Uses service-role client.
    """
    if current_user.role != "cms_editor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Requires cms_editor role.",
        )

    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No update fields provided.",
        )

    try:
        res = service_client.from_("recipes").update(update_data).eq("id", id).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Recipe not found or update failed.",
            )
        return res.data[0]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update recipe: {str(e)}",
        )


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recipe(
    id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service_client: Client = Depends(get_service_client),
):
    """
    Delete a recipe.
    Requires cms_editor role. Uses service-role client.
    """
    if current_user.role != "cms_editor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Requires cms_editor role.",
        )

    try:
        service_client.from_("recipes").delete().eq("id", id).execute()
        return None
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete recipe: {str(e)}",
        )
