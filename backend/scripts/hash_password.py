#!/usr/bin/env python3
"""
CLI helper to hash passwords using hashlib.scrypt (standard library).
Format: scrypt$N$r$p$salt_b64$hash_b64
"""
import sys
import os

# Add backend directory to sys.path so app modules can be loaded
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.core.security import hash_password, verify_password

def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/hash_password.py <password>")
        sys.exit(1)
        
    raw_password = sys.argv[1]
    hashed = hash_password(raw_password)
    print("Password:", raw_password)
    print("Hash:", hashed)
    
    # Verify sanity check
    assert verify_password(raw_password, hashed), "Verification failed!"
    print("[OK] Verification check passed.")

if __name__ == "__main__":
    main()
