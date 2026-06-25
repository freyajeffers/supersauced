from typing import List
from fastapi import APIRouter, Depends, HTTPException, status

try:
    from supabase import Client
except Exception:

    class Client:  # type: ignore
        def __init__(self, *args, **kwargs):
            pass


from app.api.deps import get_user_client, get_service_client, get_current_user
from app.schemas.auth import CurrentUser
from app.schemas.recipe import RecipeStep, RecipeStepCreate, RecipeStepUpdate

router = APIRouter()


@router.get("", response_model=List[RecipeStep])
def list_recipe_steps(
    limit: int = 10,
    offset: int = 0,
    current_user: CurrentUser = Depends(get_current_user),
    user_client: Client = Depends(get_user_client),
):
    """
    List recipe steps with pagination.
    Uses user-scoped client.
    """
    try:
        res = (
            user_client.from_("recipe_steps")
            .select("*")
            .range(offset, offset + limit - 1)
            .execute()
        )
        return res.data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to list steps: {str(e)}",
        )


@router.get("/{id}", response_model=RecipeStep)
def get_recipe_step(
    id: str,
    current_user: CurrentUser = Depends(get_current_user),
    user_client: Client = Depends(get_user_client),
):
    """
    Get a single recipe step by ID.
    Uses user-scoped client.
    """
    try:
        res = user_client.from_("recipe_steps").select("*").eq("id", id).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Step not found or access denied.",
            )
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to fetch step: {str(e)}",
        )


@router.post("", response_model=RecipeStep, status_code=status.HTTP_201_CREATED)
def create_recipe_step(
    body: RecipeStepCreate,
    current_user: CurrentUser = Depends(get_current_user),
    service_client: Client = Depends(get_service_client),
):
    """
    Create a new recipe step.
    Requires cms_editor role. Uses service-role client.
    """
    if current_user.role != "cms_editor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Requires cms_editor role.",
        )

    try:
        insert_data = body.model_dump()
        res = service_client.from_("recipe_steps").insert(insert_data).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to create step.",
            )
        return res.data[0]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create step: {str(e)}",
        )


@router.put("/{id}", response_model=RecipeStep)
def update_recipe_step(
    id: str,
    body: RecipeStepUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    service_client: Client = Depends(get_service_client),
):
    """
    Update a recipe step.
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
        res = (
            service_client.from_("recipe_steps")
            .update(update_data)
            .eq("id", id)
            .execute()
        )
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Step not found or update failed.",
            )
        return res.data[0]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update step: {str(e)}",
        )


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recipe_step(
    id: str,
    current_user: CurrentUser = Depends(get_current_user),
    service_client: Client = Depends(get_service_client),
):
    """
    Delete a recipe step.
    Requires cms_editor role. Uses service-role client.
    """
    if current_user.role != "cms_editor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Requires cms_editor role.",
        )

    try:
        service_client.from_("recipe_steps").delete().eq("id", id).execute()
        return None
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete step: {str(e)}",
        )
