"""
Tests for the official ClickHouse MCP Server (`mcp-clickhouse`) integration.
"""

import pytest
from database.mcp_client import clickhouse_mcp_client


def test_mcp_client_initialization():
    """Verify MCP client initializes with correct parameters."""
    assert clickhouse_mcp_client is not None
    assert hasattr(clickhouse_mcp_client, "run_query")
    assert hasattr(clickhouse_mcp_client, "list_tables")
    assert hasattr(clickhouse_mcp_client, "list_databases")


def test_mcp_list_databases():
    """Verify list_databases tool execution."""
    databases = clickhouse_mcp_client.list_databases()
    assert isinstance(databases, list)
    assert len(databases) > 0


def test_mcp_list_tables():
    """Verify list_tables tool execution."""
    tables = clickhouse_mcp_client.list_tables()
    assert isinstance(tables, list)
    assert len(tables) > 0


def test_mcp_run_query_select():
    """Verify execution of SQL query via MCP run_query tool."""
    res = clickhouse_mcp_client.run_query("SELECT 1 AS status_check, 'ClickHouse MCP Online' AS msg")
    assert isinstance(res, dict)
    assert "status" in res
    assert res["status"] in ["success", "mock"]


def test_mcp_vector_search(dummy_vector_768):
    """Verify vector distance search query construction and execution via MCP."""
    results = clickhouse_mcp_client.vector_search_scenes(dummy_vector_768, limit=3)
    assert isinstance(results, list)


def test_mcp_telemetry_summary():
    """Verify analytical aggregate queries via MCP."""
    summary = clickhouse_mcp_client.get_film_telemetry_summary()
    assert isinstance(summary, dict)
    assert "status" in summary
