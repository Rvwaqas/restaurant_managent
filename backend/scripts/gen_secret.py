#!/usr/bin/env python3
"""Generate Secure Secret CLI Tool.

Generates a cryptographically strong 48-byte URL-safe secret token
suitable for JWT_SECRET / SECRET_KEY in production.

Usage:
    python scripts/gen_secret.py
"""

import secrets


def main():
    token = secrets.token_urlsafe(48)
    print("\nGenerated Strong Secret Key:")
    print("-" * 64)
    print(token)
    print("-" * 64)
    print("Add this to your environment or .env file:")
    print(f"SECRET_KEY={token}\n")


if __name__ == "__main__":
    main()
