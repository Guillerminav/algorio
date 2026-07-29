"""Fuente: Itaipu Binacional - Boletin hidrologico diario, en PDF."""
from datetime import date
from typing import Optional

from data_pipeline.extraction.gemini_client import extraer_datos
from data_pipeline.extraction.schemas import BoletinItaipu
from data_pipeline.fetchers.pdf import obtener_texto_pdf

NOMBRE = "itaipu"
SCHEMA = BoletinItaipu
COLUMNAS_CLAVE = ["fecha_boletin"]

URL_BOLETIN_ITAIPU = "https://www.itaipu.gov.br/energia/hidrologia/boletim"


def construir_url(fecha: date) -> str:
    # La URL de Itaipu es fija y siempre apunta al boletin vigente (no cambia por fecha).
    return URL_BOLETIN_ITAIPU


def obtener_contenido(url: str) -> Optional[str]:
    return obtener_texto_pdf(url)


def extraer(contenido: str) -> Optional[dict]:
    return extraer_datos(contenido, SCHEMA)


def a_filas(datos: Optional[dict]) -> list[dict]:
    """Un boletin de Itaipu es una sola fila."""
    return [datos] if datos else []
