"""
Tests for ClickHouse database manager, table persistence, and vector index.
"""

import pytest
from database.clickhouse_client import ch_manager


def test_clickhouse_manager_init():
    """Verify ClickHouseManager initializes correctly."""
    assert ch_manager is not None
    assert hasattr(ch_manager, "mcp")


def test_clickhouse_tables_exist():
    """Verify table listing and schema inspection."""
    tables = ch_manager.mcp.list_tables()
    assert isinstance(tables, list)
    expected_tables = ["scenes", "dialogues", "storyboards", "production_design", "audio_post"]
    for t in expected_tables:
        assert any(t in table_name for table_name in tables) or ch_manager.use_mock


def test_save_and_retrieve_project(sample_film_bible, sample_scenes):
    """Verify project persistence across ClickHouse tables."""
    import json
    project_id = "test-proj-" + str(abs(hash("test-project-run")))[:8]
    project_json = json.dumps({
        "project_id": project_id,
        "film_bible": sample_film_bible,
        "scenes": sample_scenes,
        "storyboards": [],
        "production_design": [],
        "audio_post": []
    })
    ch_manager.save_project(
        project_id=project_id,
        title=sample_film_bible["title"],
        genre=sample_film_bible["genre"],
        tone=sample_film_bible["tone"],
        premise=sample_film_bible["logline"],
        grounded=False,
        doc_id="",
        project_json=project_json
    )
    
    retrieved = ch_manager.load_project(project_id)
    assert retrieved is not None
    assert retrieved.get("film_bible", {}).get("title") == sample_film_bible["title"]
