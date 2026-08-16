import os
import json
import logging
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Ensure MCP write access is enabled for table creation and inserts if needed
if "CLICKHOUSE_ALLOW_WRITE_ACCESS" not in os.environ:
    os.environ["CLICKHOUSE_ALLOW_WRITE_ACCESS"] = "true"

from observability import get_logger, log_event

logger = get_logger("CineAgent.ClickHouseMCP")

try:
    import mcp_clickhouse
    import mcp_clickhouse.mcp_server as ch_mcp
    MCP_CLICKHOUSE_AVAILABLE = True
except Exception as e:
    logger.warning(f"mcp-clickhouse package initialization error: {e}")
    MCP_CLICKHOUSE_AVAILABLE = False
    ch_mcp = None


class ClickHouseMCPClient:
    """
    Model Context Protocol (MCP) client bridging CineAgent Studio and Gemini agents
    with the official ClickHouse MCP server (`mcp-clickhouse`).
    
    Exposes standard MCP tools (`run_query`, `list_tables`, `list_databases`, and vector semantic search)
    at runtime to satisfy Google Cloud Agentic Cinema Hackathon ClickHouse track requirements.
    """
    def __init__(self):
        self.host = os.getenv("CLICKHOUSE_HOST", None)
        self.user = os.getenv("CLICKHOUSE_USER", "default")
        self.password = os.getenv("CLICKHOUSE_PASSWORD", "")
        self.port = int(os.getenv("CLICKHOUSE_PORT", "8443"))
        self.secure = os.getenv("CLICKHOUSE_SECURE", "true").lower() == "true"
        self.database = os.getenv("CLICKHOUSE_DATABASE", "default")
        self.is_available = MCP_CLICKHOUSE_AVAILABLE and bool(self.host)

        log_event(
            logger,
            "clickhouse_mcp_client_init",
            mcp_available=MCP_CLICKHOUSE_AVAILABLE,
            host=self.host,
            database=self.database
        )

    def run_query(self, query: str) -> Dict[str, Any]:
        """
        Execute a SQL query via the official ClickHouse MCP server tool `run_query`.
        """
        if not self.is_available or ch_mcp is None:
            log_event(logger, "mcp_query_skipped_mock", query=query[:100])
            return {"status": "mock", "result": [], "message": "ClickHouse MCP in local/mock mode"}

        try:
            log_event(logger, "mcp_tool_exec_started", tool="run_query", query_snippet=query[:120])
            raw_result = ch_mcp.run_query(query=query)
            
            # Parse result if returned as JSON string
            parsed = raw_result
            if isinstance(raw_result, str):
                try:
                    parsed = json.loads(raw_result)
                except Exception:
                    parsed = raw_result

            log_event(logger, "mcp_tool_exec_completed", tool="run_query", success=True)
            return {"status": "success", "result": parsed}
        except Exception as e:
            logger.exception(f"ClickHouse MCP run_query failed: {e}")
            log_event(logger, "mcp_tool_exec_failed", tool="run_query", error=str(e))
            return {"status": "error", "error": str(e)}

    def list_tables(self, database: Optional[str] = None, like: Optional[str] = None) -> List[str]:
        """
        List tables in the database using the official ClickHouse MCP tool `list_tables`.
        """
        target_db = database or self.database
        if not self.is_available or ch_mcp is None:
            return ["scenes", "dialogues", "storyboards", "production_design", "audio_post", "projects"]

        try:
            log_event(logger, "mcp_tool_exec_started", tool="list_tables", database=target_db)
            raw_res = ch_mcp.list_tables(database=target_db, like=like)
            if isinstance(raw_res, str):
                try:
                    data = json.loads(raw_res)
                    if isinstance(data, list):
                        return [t.get("name", str(t)) if isinstance(t, dict) else str(t) for t in data]
                except Exception:
                    pass
            log_event(logger, "mcp_tool_exec_completed", tool="list_tables", success=True)
            return [raw_res] if isinstance(raw_res, str) else raw_res
        except Exception as e:
            logger.warning(f"ClickHouse MCP list_tables fallback: {e}")
            return ["scenes", "dialogues", "storyboards", "production_design", "audio_post", "projects"]

    def list_databases(self) -> List[str]:
        """
        List databases in ClickHouse using official MCP tool `list_databases`.
        """
        if not self.is_available or ch_mcp is None:
            return ["default", "system"]
        try:
            raw_res = ch_mcp.list_databases()
            return raw_res if isinstance(raw_res, list) else [raw_res]
        except Exception as e:
            logger.warning(f"ClickHouse MCP list_databases fallback: {e}")
            return ["default"]

    def vector_search_scenes(self, embedding: List[float], limit: int = 5) -> List[Dict[str, Any]]:
        """
        Performs semantic vector similarity search across scenes stored in ClickHouse
        by executing an L2 / Cosine distance SQL query through the MCP `run_query` tool.
        """
        emb_str = "[" + ", ".join(f"{x:.6f}" for x in embedding) + "]"
        sql = f"""
        SELECT 
            scene_id,
            title,
            heading,
            description,
            tension_score,
            pacing_tag,
            cosineDistance(embedding, {emb_str}) AS score
        FROM scenes
        ORDER BY score ASC
        LIMIT {limit}
        """
        res = self.run_query(sql)
        if res.get("status") == "success":
            data = res.get("result")
            if isinstance(data, list):
                return data
            elif isinstance(data, dict) and "data" in data:
                return data["data"]
        return []

    def get_film_telemetry_summary(self, project_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Runs analytical aggregate queries via MCP `run_query` to summarize film assets & pacing.
        """
        where_clause = f"WHERE project_id = '{project_id}'" if project_id else ""
        sql = f"""
        SELECT 
            count() as total_scenes,
            avg(tension_score) as avg_tension,
            min(tension_score) as min_tension,
            max(tension_score) as max_tension
        FROM scenes
        {where_clause}
        """
        res = self.run_query(sql)
        return res


# Global singleton instance for runtime MCP tool calls
clickhouse_mcp_client = ClickHouseMCPClient()
