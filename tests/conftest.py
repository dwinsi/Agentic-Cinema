import os
import sys
import pytest
from fastapi.testclient import TestClient

# Ensure workspace root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import app
from database.clickhouse_client import ch_manager
from database.mcp_client import clickhouse_mcp_client
from agents.film_crew import film_crew

@pytest.fixture(scope="session")
def test_client():
    """Provides a FastAPI TestClient instance."""
    with TestClient(app) as client:
        yield client

@pytest.fixture(scope="session")
def sample_film_bible():
    """Sample generated Film Bible for unit/integration tests."""
    return {
        "title": "Quantum Horizon",
        "logline": "A rogue astrophysicist uncovers an anomaly that warps time around a lunar observatory.",
        "genre": "Sci-Fi Thriller",
        "tone": "Suspenseful & Cerebral",
        "characters": [
            {"name": "Dr. Elena Vance", "role": "Lead Astrophysicist", "archetype": "Obsessive Visionary"},
            {"name": "Commander Miller", "role": "Station Commander", "archetype": "Pragmatic Bureaucrat"}
        ],
        "act_structure": {
            "act_1": "Discovery of the lunar anomaly.",
            "act_2": "Communications failure and temporal distortions.",
            "act_3": "Sacrifice to stabilize the quantum core."
        }
    }

@pytest.fixture(scope="session")
def sample_scenes():
    """Sample breakdown scenes for testing."""
    return [
        {
            "scene_id": "scene-1",
            "title": "The Anomaly Awakes",
            "heading": "INT. LUNAR OBSERVATORY - NIGHT",
            "description": "Monitors flash amber as gravitational waves spike beyond scale.",
            "tension_score": 7.5,
            "pacing_tag": "BUILD",
            "dialogue": [
                {"character": "Elena", "emotion": "Frantic", "line": "The readings don't make sense. Time is decelerating."}
            ]
        },
        {
            "scene_id": "scene-2",
            "title": "Temporal Collapse",
            "heading": "INT. CORE CHAMBER - CONTINUOUS",
            "description": "Sparks erupt as the gravity containment rings spin out of alignment.",
            "tension_score": 9.2,
            "pacing_tag": "CLIMAX",
            "dialogue": [
                {"character": "Miller", "emotion": "Desperate", "line": "Elena, seal the bulkheads now!"}
            ]
        }
    ]

@pytest.fixture(scope="session")
def dummy_vector_768():
    """768-dimensional normalized test vector for Vertex AI embeddings."""
    return [0.036] * 768
