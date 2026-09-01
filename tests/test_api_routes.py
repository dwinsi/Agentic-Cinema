"""
Tests for CineAgent Studio FastAPI REST endpoints.
"""

import pytest


def test_root_html_endpoint(test_client):
    """Verify web UI root page loads successfully."""
    response = test_client.get("/")
    assert response.status_code == 200
    assert "html" in response.headers.get("content-type", "")


def test_clickhouse_mcp_status_endpoint(test_client):
    """Verify /api/clickhouse/mcp/status endpoint returns MCP tool registry and health."""
    response = test_client.get("/api/clickhouse/mcp/status")
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "success"
    assert data.get("mcp_server") == "io.github.ClickHouse/mcp-clickhouse"
    assert "run_query" in data.get("tools", [])


def test_clickhouse_mcp_query_endpoint(test_client):
    """Verify /api/clickhouse/mcp/query endpoint executes SQL queries via MCP."""
    payload = {"query": "SELECT 42 AS answer, 'ClickHouse MCP API Active' AS status"}
    response = test_client.post("/api/clickhouse/mcp/query", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "success"
    assert data.get("mcp_server") == "io.github.ClickHouse/mcp-clickhouse"


def test_analytics_endpoint(test_client):
    """Verify /api/analytics returns real-time script pacing & ClickHouse telemetry."""
    response = test_client.get("/api/analytics")
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "success"
    assert "telemetry" in data


def test_projects_list_endpoint(test_client):
    """Verify /api/projects returns the stored projects list."""
    response = test_client.get("/api/projects")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data.get("projects"), list)
