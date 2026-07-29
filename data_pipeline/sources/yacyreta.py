"""Fuente: Entidad Binacional Yacyreta (EBY) - Resumen Ejecutivo diario, en HTML."""
from datetime import date
from typing import Optional

from bs4 import BeautifulSoup

from data_pipeline.extraction.gemini_client import extraer_datos
from data_pipeline.extraction.schemas import ResumenEjecutivoYacyreta
from data_pipeline.fetchers.web import obtener_html_pagina, obtener_texto_pagina

NOMBRE = "yacyreta"
SCHEMA = ResumenEjecutivoYacyreta
COLUMNAS_CLAVE = ["fecha_boletin"]

# La EBY publica un resumen ejecutivo por dia con un numero de boletin
# correlativo en la URL (ej. ".../resumen-ejecutivo-n-6032-27-07-2026/"), asi
# que no se puede calcular a partir de la fecha. En cambio, se entra a la
# categoria del sitio donde se listan todos los resumenes (mas nuevo primero)
# y se toma el primer enlace: es el mismo mecanismo que usarias manualmente
# ("entro a la categoria y hago click en el ultimo publicado").
URL_CATEGORIA = "https://www.eby.gov.py/category/nivelembalse/"


def _url_ultimo_resumen_ejecutivo() -> Optional[str]:
    # Mismo problema de certificado que obtener_contenido: se desactiva la
    # verificacion SSL puntualmente para este dominio.
    html = obtener_html_pagina(URL_CATEGORIA, verificar_ssl=False)
    if html is None:
        return None
    soup = BeautifulSoup(html, "html.parser")
    enlace = soup.find("a", href=lambda href: href and "resumen-ejecutivo" in href)
    return enlace["href"] if enlace else None


def construir_url(fecha: date) -> str:
    url = _url_ultimo_resumen_ejecutivo()
    if not url:
        raise ValueError(
            f"No se encontro ningun resumen ejecutivo en {URL_CATEGORIA} "
            "(¿cambio la estructura de la pagina de la EBY?)."
        )
    return url


def obtener_contenido(url: str) -> Optional[str]:
    # El certificado TLS de www.eby.gov.py falla la verificacion por defecto de
    # requests; se desactiva puntualmente para esta fuente (igual que en el
    # prototipo original).
    return obtener_texto_pagina(url, verificar_ssl=False)


def extraer(contenido: str) -> Optional[dict]:
    return extraer_datos(contenido, SCHEMA)


def a_filas(datos: Optional[dict]) -> list[dict]:
    """Un boletin de Yacyreta es una sola fila."""
    return [datos] if datos else []
