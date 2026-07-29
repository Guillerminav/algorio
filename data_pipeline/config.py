"""Configuracion central del pipeline: credenciales y modelos.

Los datos extraidos se guardan en Postgres (ver db.py), no en archivos: no
hace falta configuracion de rutas ademas de DATABASE_URL, que lee db.py.
"""
import os

from dotenv import load_dotenv

load_dotenv()

# --- Gemini ---
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
MODELO_PRINCIPAL = os.environ.get("GEMINI_MODELO_PRINCIPAL", "gemini-3.5-flash-lite")
MODELO_RESPALDO = os.environ.get("GEMINI_MODELO_RESPALDO", "gemini-flash-latest")

# --- Red ---
USER_AGENT = "Mozilla/5.0"
MAX_INTENTOS = 3
ESPERA_ENTRE_INTENTOS_SEG = 30
