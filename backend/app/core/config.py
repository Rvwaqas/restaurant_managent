from typing import Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Soufi Restaurant POS Backend"
    APP_NAME: str = "Soufi Restaurant"
    API_V1_STR: str = "/api"
    SECRET_KEY: str = "soufi-pos-super-secret-key-change-in-production-12345"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 12  # 12 hours shift token
    APP_ENV: str = "dev"  # "dev" | "prod" | "test"

    # Database & Durability (Phase B7)
    DATABASE_URL: str = "sqlite:///./pos.db"
    SQLITE_SYNCHRONOUS: str = "FULL"  # "FULL" (default prod) | "NORMAL" (dev/tests)

    # Backups, Maintenance & Diagnostics (Phase B7)
    APP_VERSION: str = "1.0.0"
    BUILD_DATE: str = "2026-01-01"
    BACKUP_DIR: str = "data/backups"
    BACKUP_TIME: str = "04:00"  # Local daily time (HH:MM)
    BACKUP_KEEP_DAILY: int = 14
    BACKUP_KEEP_WEEKLY: int = 8
    BACKUP_KEEP_MONTHLY: int = 6
    BACKUP_EXTRA_DIR: Optional[str] = None
    BACKUP_COMMAND: Optional[str] = None
    BACKUP_MIN_FREE_MB: int = 500
    AUDIT_RETENTION_DAYS: int = 730
    LOG_DIR: str = "data/logs"
    AUTO_MIGRATE: bool = True
    CLOCK_OVERRIDE: Optional[str] = None  # For testing clock guard

    # Restaurant Operating Hours & Boundaries (Addendum to B1)
    OPENING_TIME: str = "07:00"
    CLOSING_TIME: str = "23:00"
    BUSINESS_DAY_START_HOUR: int = 5
    TIMEZONE: str = "Asia/Karachi"

    # Financial Configuration (Default 0 per specs)
    TAX_RATE: float = 0.0
    SERVICE_CHARGE_RATE: float = 0.0
    CURRENCY_SYMBOL: str = "Rs"
    CASHIER_PRINTER_ID: str = "prn-cashier"

    # Path to user configuration file
    USERS_CONFIG_PATH: str = "backend/config/users.yaml"

    # Printing settings (Phase B2 / B4)
    PRINT_MODE: str = "simulate"  # "simulate" | "network"
    PRINT_COLUMNS: int = 48  # Valid: 32, 42, 48
    PRINT_CONNECT_TIMEOUT: float = 2.0
    PRINT_SEND_TIMEOUT: float = 4.0
    PRINT_CHECK_STATUS: bool = True
    PRINT_CUT: bool = True
    PRINT_CASH_DRAWER_KICK: bool = False
    PRINT_RECOVER_MAX_AGE_MINUTES: int = 10
    PRINT_JOB_RETENTION_DAYS: int = 60
    PRINT_SIM_DIR: str = "data/print_sim"
    SIMULATE_FAIL_PRINTERS: str = ""  # Comma-separated printer IDs to simulate failure

    # Image uploads
    UPLOAD_DIR: str = "backend/uploads"
    PUBLIC_BASE_URL: Optional[str] = None  # If None, inferred from incoming request

    # Server Packaging, Deployment & TLS (Phase B8)
    SERVER_MODE: str = "plain"  # "plain" | "https"
    BIND_HOST: str = "0.0.0.0"
    HTTP_PORT: int = 8000
    HTTPS_PORT: int = 8443
    HELPER_HTTP_PORT: int = 8080
    TLS_CERT_FILE: str = "certs/server.crt"
    TLS_KEY_FILE: str = "certs/server.key"
    TLS_CA_CERT_FILE: str = "certs/ca.crt"
    TLS_CA_KEY_FILE: str = "certs/ca.key"
    FRONTEND_DIST_DIR: Optional[str] = None  # Static frontend build directory
    KEEPALIVE_TIMEOUT: int = 65

    # WebSocket Real-Time Gateway settings (Phase B6)
    WS_HEARTBEAT_SECONDS: int = 20
    WS_IDLE_TIMEOUT_SECONDS: int = 60
    WS_MAX_CONNECTIONS: int = 50
    WS_SEND_QUEUE_MAX: int = 100
    WS_COALESCE_MS: int = 50
    WS_ALLOWED_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"
    WS_MAX_MESSAGE_BYTES: int = 4096

    @field_validator("SERVER_MODE")
    @classmethod
    def validate_server_mode(cls, v: str) -> str:
        v_lower = v.lower()
        if v_lower not in ("plain", "https"):
            raise ValueError("SERVER_MODE must be 'plain' or 'https'")
        return v_lower

    @field_validator("SQLITE_SYNCHRONOUS")
    @classmethod
    def validate_sqlite_synchronous(cls, v: str) -> str:
        v_upper = v.upper()
        if v_upper not in ("FULL", "NORMAL"):
            raise ValueError("SQLITE_SYNCHRONOUS must be 'FULL' or 'NORMAL'")
        return v_upper

    @field_validator("PRINT_MODE")
    @classmethod
    def validate_print_mode(cls, v: str) -> str:
        if v not in ("simulate", "network"):
            raise ValueError("PRINT_MODE must be 'simulate' or 'network'")
        return v

    @field_validator("PRINT_COLUMNS")
    @classmethod
    def validate_print_columns(cls, v: int) -> int:
        if v not in (32, 42, 48):
            raise ValueError("PRINT_COLUMNS must be 32, 42, or 48")
        return v

    @field_validator("WS_HEARTBEAT_SECONDS")
    @classmethod
    def validate_ws_heartbeat(cls, v: int) -> int:
        if v < 1:
            raise ValueError("WS_HEARTBEAT_SECONDS must be at least 1")
        return v

    @field_validator("WS_MAX_CONNECTIONS")
    @classmethod
    def validate_ws_max_connections(cls, v: int) -> int:
        if v < 1:
            raise ValueError("WS_MAX_CONNECTIONS must be at least 1")
        return v

    @field_validator("WS_SEND_QUEUE_MAX")
    @classmethod
    def validate_ws_send_queue_max(cls, v: int) -> int:
        if v < 5:
            raise ValueError("WS_SEND_QUEUE_MAX must be at least 5")
        return v

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="allow",
    )

settings = Settings()
