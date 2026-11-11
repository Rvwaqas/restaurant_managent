#!/usr/bin/env python
"""
Root wrapper for Soufi POS database seeding and demo history generation.
Delegates directly to backend/scripts/seed.py.
"""
import os
import sys

# Ensure backend directory is in sys.path
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(root_dir, "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from scripts.seed import main

if __name__ == "__main__":
    main()

