"""Fuente: Instituto Nacional del Agua (INA, Argentina) - Cuadro de alerta diario, en PDF.

A diferencia de las otras fuentes, un mismo boletin trae MUCHAS estaciones a la
vez. Por eso extraer() manda el PDF directo a Gemini como bytes (sin pasar por
pdfplumber, que pierde la estructura de la tabla) y a_filas() explota la lista
de estaciones en una fila por cada una.
"""
from datetime import date
from typing import Optional

from data_pipeline.extraction.gemini_client import extraer_datos_de_pdf
from data_pipeline.extraction.schemas import CuadroINA
from data_pipeline.fetchers.pdf import descargar_pdf_bytes

NOMBRE = "ina"
SCHEMA = CuadroINA
COLUMNAS_CLAVE = ["fecha_boletin", "estacion"]

# La URL depende de la fecha, y el cuadro del dia suele subir mas tarde. Si el
# de hoy todavia no esta publicado, main.py prueba automaticamente con los
# N dias anteriores hasta encontrar el ultimo disponible.
DIAS_ATRAS_SI_FALTA = 3

MESES_ES = {
    1: "ene", 2: "feb", 3: "mar", 4: "abr", 5: "may", 6: "jun",
    7: "jul", 8: "ago", 9: "sep", 10: "oct", 11: "nov", 12: "dic",
}

INSTRUCCIONES_EXTRACCION = (
    "Extrae todas las estaciones que figuran en esta tabla del Instituto Nacional del Agua, "
    "con su nivel actual, tendencia y estado (color/alerta). "
    "Incluir la fecha de emision del informe. Si un dato no esta visible, dejalo como null."
)


def construir_url(fecha: date) -> str:
    return (
        f"https://www.ina.gov.ar/archivos/alerta/"
        f"Cuadro_{fecha.year}{MESES_ES[fecha.month]}{fecha.day:02d}.pdf"
    )


def obtener_contenido(url: str) -> Optional[bytes]:
    return descargar_pdf_bytes(url)


def extraer(contenido: bytes) -> Optional[dict]:
    return extraer_datos_de_pdf(contenido, SCHEMA, INSTRUCCIONES_EXTRACCION)


def _normalizar_fecha(fecha_boletin: str) -> str:
    """Gemini a veces devuelve la fecha con '/' (ej. '2026/07/27') en vez de
    '-' como las demas fuentes; se unifica el separador para que las tres
    tablas del frontend muestren el mismo formato."""
    return fecha_boletin.replace("/", "-")


def a_filas(datos: Optional[dict]) -> list[dict]:
    """Un boletin de INA trae varias estaciones: una fila por estacion."""
    if not datos:
        return []
    return [
        {"fecha_boletin": _normalizar_fecha(datos["fecha_boletin"]), **estacion}
        for estacion in datos["estaciones"]
    ]
