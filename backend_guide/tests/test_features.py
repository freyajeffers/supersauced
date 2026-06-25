import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock

def test_search_recipes_success(test_client: TestClient, generate_jwt, mock_user_client):
    # Arrange mock Supabase query chain
    mock_query = MagicMock()
    # Chain methods: select -> contains (optional) -> range -> execute
    mock_query.select.return_value = mock_query
    mock_query.contains.return_value = mock_query
    mock_query.range.return_value = mock_query
    mock_query.execute.return_value = MagicMock(data=[{"id": "1", "title": "Test Recipe", "slug": "test-recipe", "description": "Desc", "hero_image_url": None, "difficulty": 1, "cook_time_minutes": 10, "calories_per_serving": 200, "protein_g": 10, "fat_g": 5, "carbs_g": 30, "cube_tags": [], "dietary_tags": [], "servings_default": 2, "is_published": True}])
    mock_user_client.from_.return_value = mock_query

    token = generate_jwt("user123", "user@example.com", role="authenticated")
    headers = {"Authorization": f"Bearer {token}"}

    response = test_client.get("/v1/features/search?limit=5", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert data[0]["id"] == "1"
    assert data[0]["title"] == "Test Recipe"

def test_search_recipes_error(test_client: TestClient, generate_jwt, mock_user_client):
    # Mock query that raises an exception on execute
    mock_query = MagicMock()
    mock_query.select.return_value = mock_query
    mock_query.contains.return_value = mock_query
    mock_query.range.return_value = mock_query
    mock_query.execute.side_effect = Exception("DB failure")
    mock_user_client.from_.return_value = mock_query

    token = generate_jwt("user123", "user@example.com", role="authenticated")
    headers = {"Authorization": f"Bearer {token}"}

    response = test_client.get("/v1/features/search", headers=headers)
    assert response.status_code == 400
    assert "Search failed" in response.json()["detail"]
