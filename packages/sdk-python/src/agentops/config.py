"""AgentOps configuration."""

import os
from dataclasses import dataclass


@dataclass
class Config:
    """AgentOps configuration."""
    
    api_key: str
    endpoint: str = "https://ingest.agentops.dev"
    flush_interval: float = 1.0  # seconds
    max_batch_size: int = 100
    disabled: bool = False
    debug: bool = False
    
    @classmethod
    def from_env(cls, **kwargs: object) -> "Config":
        """Create config from environment variables.
        
        Environment variables:
            AGENTOPS_API_KEY: API key (required if not passed)
            AGENTOPS_ENDPOINT: Ingestion endpoint
            AGENTOPS_DISABLED: Disable tracking
            AGENTOPS_DEBUG: Enable debug logging
        """
        api_key = kwargs.get("api_key") or os.getenv("AGENTOPS_API_KEY")
        if not api_key:
            raise ValueError(
                "AgentOps API key is required. "
                "Pass api_key parameter or set AGENTOPS_API_KEY environment variable."
            )
        
        return cls(
            api_key=str(api_key),
            endpoint=str(kwargs.get("endpoint") or os.getenv("AGENTOPS_ENDPOINT", "https://ingest.agentops.dev")),
            flush_interval=float(kwargs.get("flush_interval") or os.getenv("AGENTOPS_FLUSH_INTERVAL", "1.0")),
            max_batch_size=int(kwargs.get("max_batch_size") or os.getenv("AGENTOPS_MAX_BATCH_SIZE", "100")),
            disabled=bool(kwargs.get("disabled") or os.getenv("AGENTOPS_DISABLED", "").lower() == "true"),
            debug=bool(kwargs.get("debug") or os.getenv("AGENTOPS_DEBUG", "").lower() == "true"),
        )
