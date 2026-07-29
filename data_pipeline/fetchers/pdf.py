"""Descarga de PDFs: como bytes crudos (para mandar directo a Gemini) o como texto
extraido con pdfplumber (para mandar como texto plano, igual que una pagina HTML)."""
import io
import time
from typing import Optional

import pdfplumber
import requests

from data_pipeline.config import ESPERA_ENTRE_INTENTOS_SEG, MAX_INTENTOS, USER_AGENT


def descargar_pdf_bytes(
    url_pdf: str,
    max_intentos: int = MAX_INTENTOS,
    espera_seg: int = ESPERA_ENTRE_INTENTOS_SEG,
) -> Optional[bytes]:
    """Descarga un PDF y devuelve sus bytes crudos, sin parsear."""
    for intento in range(1, max_intentos + 1):
        try:
            resp = requests.get(url_pdf, timeout=20, headers={"User-Agent": USER_AGENT})
            resp.raise_for_status()
            return resp.content
        except requests.exceptions.HTTPError as e:
            if e.response is not None and e.response.status_code == 404:
                # 404 = el boletin de esa fecha todavia no fue publicado; no tiene
                # sentido reintentar la misma URL, se reporta como no disponible.
                print(f"{url_pdf} todavia no existe (404).")
                return None
            print(f"Intento {intento}/{max_intentos} descargando {url_pdf} fallo: {e}")
            if intento < max_intentos:
                time.sleep(espera_seg)
        except Exception as e:
            print(f"Intento {intento}/{max_intentos} descargando {url_pdf} fallo: {e}")
            if intento < max_intentos:
                time.sleep(espera_seg)
    print(f"No se pudo descargar el PDF de {url_pdf} tras {max_intentos} intentos.")
    return None


def obtener_texto_pdf(
    url_pdf: str,
    max_intentos: int = MAX_INTENTOS,
    espera_seg: int = ESPERA_ENTRE_INTENTOS_SEG,
) -> Optional[str]:
    """Descarga un PDF y extrae su texto (parrafos + tablas) con pdfplumber."""
    pdf_bytes = descargar_pdf_bytes(url_pdf, max_intentos, espera_seg)
    if pdf_bytes is None:
        return None
    try:
        texto = ""
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for pagina in pdf.pages:
                texto += (pagina.extract_text() or "") + "\n"
                for tabla in pagina.extract_tables():
                    texto += str(tabla) + "\n"
        return texto
    except Exception as e:
        print(f"No se pudo extraer texto del PDF {url_pdf}: {e}")
        return None
