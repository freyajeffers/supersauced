from unittest.mock import MagicMock
from fastapi import status
from fastapi.testclient import TestClient


def test_list_recipe_ingredients(
    test_client: TestClient, mock_user_client, generate_jwt
):
    token = generate_jwt(sub="user-123", email="user123@example.com")

    mock_query_res = MagicMock()
    mock_query_res.data = [
        {
            "id": "ing-1",
            "recipe_id": "recipe-1",
            "quantity": 2.5,
            "unit": "cups",
            "name": "Tomatoes",
            "notes": "Diced",
            "position": 1,
        }
    ]

    mock_user_client.from_.return_value.select.return_value.range.return_value.execute.return_value = (
        mock_query_res
    )

    headers = {"Authorization": f"Bearer {token}"}
    resp = test_client.get(
        "/recipe_ingredients?limit=10&offset=0", headers=headers
    )
    assert resp.status_code == status.HTTP_200_OK
    assert len(resp.json()) == 1
    assert resp.json()[0]["id"] == "ing-1"
    mock_user_client.from_.assert_called_with("recipe_ingredients")


def test_get_recipe_ingredient_by_id_success(
    test_client: TestClient, mock_user_client, generate_jwt
):
    token = generate_jwt(sub="user-123", email="user123@example.com")

    mock_query_res = MagicMock()
    mock_query_res.data = [
        {
            "id": "ing-1",
            "recipe_id": "recipe-1",
            "quantity": 2.5,
            "unit": "cups",
            "name": "Tomatoes",
        }
    ]

    mock_user_client.from_.return_value.select.return_value.eq.return_value.execute.return_value = (
        mock_query_res
    )

    headers = {"Authorization": f"Bearer {token}"}
    resp = test_client.get("/recipe_ingredients/ing-1", headers=headers)
    assert resp.status_code == status.HTTP_200_OK
    assert resp.json()["id"] == "ing-1"


def test_get_recipe_ingredient_by_id_not_found(
    test_client: TestClient, mock_user_client, generate_jwt
):
    token = generate_jwt(sub="user-123", email="user123@example.com")

    mock_query_res = MagicMock()
    mock_query_res.data = []

    mock_user_client.from_.return_value.select.return_value.eq.return_value.execute.return_value = (
        mock_query_res
    )

    headers = {"Authorization": f"Bearer {token}"}
    resp = test_client.get("/recipe_ingredients/ing-none", headers=headers)
    assert resp.status_code == status.HTTP_404_NOT_FOUND


def test_create_recipe_ingredient_as_cms_editor(
    test_client: TestClient, mock_service_client, generate_jwt
):
    token = generate_jwt(
        sub="user-123", email="editor@example.com", role="cms_editor"
    )

    mock_query_res = MagicMock()
    mock_query_res.data = [
        {
            "id": "ing-new",
            "recipe_id": "recipe-1",
            "quantity": 1.0,
            "unit": "tbsp",
            "name": "Olive Oil",
        }
    ]

    mock_service_client.from_.return_value.insert.return_value.execute.return_value = (
        mock_query_res
    )

    payload = {
        "recipe_id": "recipe-1",
        "quantity": 1.0,
        "unit": "tbsp",
        "name": "Olive Oil",
    }

    headers = {"Authorization": f"Bearer {token}"}
    resp = test_client.post(
        "/recipe_ingredients", json=payload, headers=headers
    )
    assert resp.status_code == status.HTTP_201_CREATED
    assert resp.json()["id"] == "ing-new"
    mock_service_client.from_.assert_called_with("recipe_ingredients")


def test_create_recipe_ingredient_forbidden(
    test_client: TestClient, generate_jwt
):
    token = generate_jwt(
        sub="user-123", email="user@example.com", role="authenticated"
    )

    payload = {"recipe_id": "recipe-1", "name": "Olive Oil"}

    headers = {"Authorization": f"Bearer {token}"}
    resp = test_client.post(
        "/recipe_ingredients", json=payload, headers=headers
    )
    assert resp.status_code == status.HTTP_403_FORBIDDEN


def test_update_recipe_ingredient_as_cms_editor(
    test_client: TestClient, mock_service_client, generate_jwt
):
    token = generate_jwt(
        sub="user-123", email="editor@example.com", role="cms_editor"
    )

    mock_query_res = MagicMock()
    mock_query_res.data = [
        {
            "id": "ing-1",
            "recipe_id": "recipe-1",
            "quantity": 3.0,
            "unit": "cups",
            "name": "Tomatoes",
        }
    ]

    mock_service_client.from_.return_value.update.return_value.eq.return_value.execute.return_value = (
        mock_query_res
    )

    payload = {"quantity": 3.0}

    headers = {"Authorization": f"Bearer {token}"}
    resp = test_client.put(
        "/recipe_ingredients/ing-1", json=payload, headers=headers
    )
    assert resp.status_code == status.HTTP_200_OK
    assert resp.json()["quantity"] == 3.0


def test_update_recipe_ingredient_forbidden(
    test_client: TestClient, generate_jwt
):
    token = generate_jwt(
        sub="user-123", email="user@example.com", role="authenticated"
    )

    payload = {"quantity": 3.0}

    headers = {"Authorization": f"Bearer {token}"}
    resp = test_client.put(
        "/recipe_ingredients/ing-1", json=payload, headers=headers
    )
    assert resp.status_code == status.HTTP_403_FORBIDDEN


def test_delete_recipe_ingredient_as_cms_editor(
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
    resp = test_client.delete("/recipe_ingredients/ing-1", headers=headers)
    assert resp.status_code == status.HTTP_204_NO_CONTENT


def test_delete_recipe_ingredient_forbidden(
    test_client: TestClient, generate_jwt
):
    token = generate_jwt(
        sub="user-123", email="user@example.com", role="authenticated"
    )

    headers = {"Authorization": f"Bearer {token}"}
    resp = test_client.delete("/recipe_ingredients/ing-1", headers=headers)
    assert resp.status_code == status.HTTP_403_FORBIDDEN
