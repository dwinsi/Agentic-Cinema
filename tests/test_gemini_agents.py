"""
Tests for CineAgent Studio's Gemini 2.5 Flash agents and MCP workflows.
"""

import pytest
from agents.film_crew import film_crew


def test_market_analyst_agent(sample_film_bible, sample_scenes):
    """Verify Market Analyst agent queries ClickHouse MCP and calculates metrics."""
    result = film_crew.run_market_analyst(sample_film_bible, sample_scenes)
    assert isinstance(result, dict)
    assert "average_scene_tension" in result
    assert "clickhouse_vector_dimension" in result
    assert "clickhouse_mcp_tables" in result


def test_continuity_analyst_agent_mcp(dummy_vector_768):
    """Verify Continuity Supervisor agent executes MCP vector search and validates scenes."""
    analysis = film_crew.run_continuity_analyst_mcp(
        scene_id="scene-101",
        scene_description="Elena enters the lunar containment chamber carrying the quantum core.",
        scene_embedding=dummy_vector_768
    )
    assert isinstance(analysis, dict)
    assert "continuity_score" in analysis
    assert "mcp_grounded" in analysis
    assert analysis["mcp_grounded"] is True


def test_production_design_and_audio_fallback(sample_film_bible, sample_scenes):
    """Verify production design and audio departments return valid structural payloads."""
    design = film_crew.run_production_designer(sample_film_bible, sample_scenes)
    assert isinstance(design, list)
    assert len(design) == len(sample_scenes)
    assert "set_design" in design[0]

    audio = film_crew.run_audio_department(sample_scenes)
    assert isinstance(audio, list)
    assert len(audio) == len(sample_scenes)
    assert "soundtrack_theme" in audio[0]
