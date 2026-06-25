from unittest.mock import MagicMock
from fastapi import status
from fastapi.testclient import TestClient


def test_list_recipes(test_client: TestClient, mock_user_client, generate_jwt):
    token = generate_jwt(sub="user-123", email="user123@example.com")

    mock_query_res = MagicMock()
    mock_query_res.data = [
        {
            "id": "recipe-1",
            "title": "Spicy Tomato Sauce",
            "slug": "spicy-tomato-sauce",
            "description": "A delicious spicy sauce",
            "hero_image_url": "http://example.com/image.jpg",
            "difficulty": 2,
            "cook_time_minutes": 25,
            "calories_per_serving": 120,
            "protein_g": 2,
            "fat_g": 4,
            "carbs_g": 15,
            "cube_tags": ["spicy", "tomato"],
            "dietary_tags": ["vegan", "gluten-free"],
            "servings_default": 4,
            "is_published": True,
            "created_at": "2026-06-24T00:00:00Z",
            "updated_at": "2026-06-24T00:00:00Z",
        }
    ]

    # Mock chain: from_().select().contains().contains().range().execute()
    mock_user_client.from_.return_value.select.return_value.contains.return_value.contains.return_value.range.return_value.execute.return_value = (
        mock_query_res
    )

    headers = {"Authorization": f"Bearer {token}"}
    resp = test_client.get(
        "/recipes?limit=5&offset=0&cube_tags=spicy,tomato&dietary_tags=vegan,gluten-free",
        headers=headers,
    )
    assert resp.status_code == status.HTTP_200_OK
    assert len(resp.json()) == 1
    assert resp.json()[0]["id"] == "recipe-1"

    # Verify mock was called with contains
    mock_user_client.from_.assert_called_with("recipes")


def test_get_recipe_by_id_success(
    test_client: TestClient, mock_user_client, generate_jwt
):
    token = generate_jwt(sub="user-123", email="user123@example.com")

    mock_query_res = MagicMock()
    mock_query_res.data = [
        {
            "id": "recipe-1",
            "title": "Spicy Tomato Sauce",
            "slug": "spicy-tomato-sauce",
            "difficulty": 2,
            "cube_tags": ["spicy"],
            "dietary_tags": ["vegan"],
            "is_published": True,
            "created_at": "2026-06-24T00:00:00Z",
            "updated_at": "2026-06-24T00:00:00Z",
        }
    ]

    mock_user_client.from_.return_value.select.return_value.eq.return_value.execute.return_value = (
        mock_query_res
    )

    headers = {"Authorization": f"Bearer {token}"}
    resp = test_client.get("/recipes/recipe-1", headers=headers)
    assert resp.status_code == status.HTTP_200_OK
    assert resp.json()["id"] == "recipe-1"


def test_get_recipe_by_id_not_found(
    test_client: TestClient, mock_user_client, generate_jwt
):
    token = generate_jwt(sub="user-123", email="user123@example.com")

    mock_query_res = MagicMock()
    mock_query_res.data = []

    mock_user_client.from_.return_value.select.return_value.eq.return_value.execute.return_value = (
        mock_query_res
    )

    headers = {"Authorization": f"Bearer {token}"}
    resp = test_client.get("/recipes/recipe-none", headers=headers)
    assert resp.status_code == status.HTTP_404_NOT_FOUND


def test_create_recipe_as_cms_editor(
    test_client: TestClient, mock_service_client, generate_jwt
):
    # User must carry cms_editor role
    token = generate_jwt(
        sub="user-123", email="editor@example.com", role="cms_editor"
    )

    mock_query_res = MagicMock()
    mock_query_res.data = [
        {
            "id": "recipe-new",
            "title": "Mild Pesto",
            "slug": "mild-pesto",
            "difficulty": 1,
            "cube_tags": ["pesto"],
            "dietary_tags": ["vegetarian"],
            "is_published": False,
            "created_at": "2026-06-24T00:00:00Z",
            "updated_at": "2026-06-24T00:00:00Z",
        }
    ]

    mock_service_client.from_.return_value.insert.return_value.execute.return_value = (
        mock_query_res
    )

    payload = {
        "title": "Mild Pesto",
        "slug": "mild-pesto",
        "difficulty": 1,
        "cube_tags": ["pesto"],
        "dietary_tags": ["vegetarian"],
        "is_published": False,
    }

    headers = {"Authorization": f"Bearer {token}"}
    resp = test_client.post("/recipes", json=payload, headers=headers)
    assert resp.status_code == status.HTTP_201_CREATED
    assert resp.json()["id"] == "recipe-new"
    mock_service_client.from_.assert_called_with("recipes")


def test_create_recipe_forbidden(test_client: TestClient, generate_jwt):
    # Standard user role authenticated should be forbidden
    token = generate_jwt(
        sub="user-123", email="user@example.com", role="authenticated"
    )

    payload = {
        "title": "Mild Pesto",
        "slug": "mild-pesto",
        "difficulty": 1,
        "cube_tags": ["pesto"],
        "dietary_tags": ["vegetarian"],
        "is_published": False,
    }

    headers = {"Authorization": f"Bearer {token}"}
    resp = test_client.post("/recipes", json=payload, headers=headers)
    assert resp.status_code == status.HTTP_403_FORBIDDEN


def test_update_recipe_as_cms_editor(
    test_client: TestClient, mock_service_client, generate_jwt
):
    token = generate_jwt(
        sub="user-123", email="editor@example.com", role="cms_editor"
    )

    mock_query_res = MagicMock()
    mock_query_res.data = [
        {
            "id": "recipe-1",
            "title": "Super Spicy Tomato Sauce",
            "slug": "spicy-tomato-sauce",
            "difficulty": 3,
            "cube_tags": ["spicy"],
            "dietary_tags": ["vegan"],
            "is_published": True,
            "created_at": "2026-06-24T00:00:00Z",
            "updated_at": "2026-06-24T00:00:00Z",
        }
    ]

    mock_service_client.from_.return_value.update.return_value.eq.return_value.execute.return_value = (
        mock_query_res
    )

    payload = {"title": "Super Spicy Tomato Sauce", "difficulty": 3}

    headers = {"Authorization": f"Bearer {token}"}
    resp = test_client.put("/recipes/recipe-1", json=payload, headers=headers)
    assert resp.status_code == status.HTTP_200_OK
    assert resp.json()["title"] == "Super Spicy Tomato Sauce"


def test_update_recipe_forbidden(test_client: TestClient, generate_jwt):
    token = generate_jwt(
        sub="user-123", email="user@example.com", role="authenticated"
    )

    payload = {"title": "Super Spicy Tomato Sauce"}

    headers = {"Authorization": f"Bearer {token}"}
    resp = test_client.put("/recipes/recipe-1", json=payload, headers=headers)
    assert resp.status_code == status.HTTP_403_FORBIDDEN


def test_delete_recipe_as_cms_editor(
    test_client: TestClient, mock_service_client, generate_jwt
):
    token = generate_jwt(
        sub="user-123", email="editor@example.com", role="cms_editor"
    )

    mock_query_res = MagicMock()
    mock_query_res.data = []

    mock_service_client.from_.return_value.delete.return_value.eq.return_value.execute.return_value = (
        mock_query_res
    )

    headers = {"Authorization": f"Bearer {token}"}
    resp = test_client.delete("/recipes/recipe-1", headers=headers)
    assert resp.status_code == status.HTTP_204_NO_CONTENT


def test_delete_recipe_forbidden(test_client: TestClient, generate_jwt):
    token = generate_jwt(
        sub="user-123", email="user@example.com", role="authenticated"
    )

    headers = {"Authorization": f"Bearer {token}"}
    resp = test_client.delete("/recipes/recipe-1", headers=headers)
    assert resp.status_code == status.HTTP_403_FORBIDDEN
