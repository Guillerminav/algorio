"""Descarga de paginas HTML: como texto plano (para mandarle a Gemini) o como
HTML crudo (para parsear tablas directamente, sin pasar por un modelo)."""
import time
from typing import Optional

import requests
from bs4 import BeautifulSoup

from data_pipeline.config import ESPERA_ENTRE_INTENTOS_SEG, MAX_INTENTOS, USER_AGENT


def obtener_html_pagina(
    url: str,
    verificar_ssl: bool = True,
    max_intentos: int = MAX_INTENTOS,
    espera_seg: int = ESPERA_ENTRE_INTENTOS_SEG,
) -> Optional[str]:
    """Descarga una pagina y devuelve su HTML crudo, sin procesar."""
    for intento in range(1, max_intentos + 1):
        try:
            resp = requests.get(
                url, timeout=20, headers={"User-Agent": USER_AGENT}, verify=verificar_ssl
            )
            resp.raise_for_status()
            return resp.text
        except Exception as e:
            print(f"Intento {intento}/{max_intentos} para {url} fallo: {e}")
            if intento < max_intentos:
                time.sleep(espera_seg)
    print(f"No se pudo acceder a {url} tras {max_intentos} intentos.")
    return None


def obtener_texto_pagina(
    url: str,
    verificar_ssl: bool = True,
    max_intentos: int = MAX_INTENTOS,
    espera_seg: int = ESPERA_ENTRE_INTENTOS_SEG,
) -> Optional[str]:
    """Descarga una pagina y devuelve su texto visible (sin nav/footer/header)."""
    html = obtener_html_pagina(url, verificar_ssl, max_intentos, espera_seg)
    if html is None:
        return None
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup.find_all(["nav", "footer", "header"]):
        tag.decompose()
    return soup.get_text(separator="\n", strip=True)
