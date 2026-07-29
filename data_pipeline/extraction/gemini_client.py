"""Cliente de Gemini y funciones de extraccion estructurada, con fallback de modelo.

El cliente se crea recien en el primer uso (no al importar el modulo) para que
el resto del pipeline (fetchers, storage) se pueda importar y probar sin
necesitar GEMINI_API_KEY configurada.
"""
import json
import time
from typing import Optional

from google import genai
from google.genai import types

from data_pipeline.config import GEMINI_API_KEY, MODELO_PRINCIPAL, MODELO_RESPALDO

MODELOS_A_PROBAR = [MODELO_PRINCIPAL, MODELO_RESPALDO]

_client: Optional[genai.Client] = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        if not GEMINI_API_KEY:
            raise RuntimeError(
                "Falta GEMINI_API_KEY. Copia .env.example a .env y completa tu clave de Gemini."
            )
        _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client


def extraer_datos(texto_crudo: str, esquema_pydantic, max_intentos: int = 3) -> Optional[dict]:
    """Extrae datos estructurados de un texto (HTML/PDF ya convertido a texto plano)."""
    client = _get_client()
    for modelo in MODELOS_A_PROBAR:
        for intento in range(1, max_intentos + 1):
            try:
                response = client.models.generate_content(
                    model=modelo,
                    contents=f"""Extrae los datos del siguiente boletin hidrologico y completa el esquema pedido.
Si un dato no aparece en el texto, dejalo como null. Fechas en formato YYYY-MM-DD.

Texto del boletin:
{texto_crudo}""",
                    config={
                        "response_mime_type": "application/json",
                        "response_schema": esquema_pydantic,
                    },
                )
                return json.loads(response.text)
            except Exception as e:
                mensaje = str(e)
                if "NOT_FOUND" in mensaje or "no longer available" in mensaje:
                    print(f"Modelo '{modelo}' no disponible, probando siguiente modelo...")
                    break
                print(f"Intento {intento}/{max_intentos} con '{modelo}' fallo: {mensaje}")
                time.sleep(5)

    print("ADVERTENCIA: no se pudo extraer el dato con ningun modelo disponible.")
    return None


def extraer_datos_de_pdf(
    pdf_bytes: bytes, esquema_pydantic, instrucciones: str, max_intentos: int = 3
) -> Optional[dict]:
    """Extrae datos estructurados mandandole el PDF directo a Gemini (sin pasar por texto).

    Util para PDFs con tablas complejas (ej. el Cuadro del INA con varias estaciones),
    donde pdfplumber pierde la estructura de la tabla.
    """
    client = _get_client()
    for modelo in MODELOS_A_PROBAR:
        for intento in range(1, max_intentos + 1):
            try:
                response = client.models.generate_content(
                    model=modelo,
                    contents=[
                        types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"),
                        instrucciones,
                    ],
                    config={
                        "response_mime_type": "application/json",
                        "response_schema": esquema_pydantic,
                    },
                )
                return json.loads(response.text)
            except Exception as e:
                mensaje = str(e)
                if "NOT_FOUND" in mensaje or "no longer available" in mensaje:
                    print(f"Modelo '{modelo}' no disponible, probando siguiente modelo...")
                    break
                print(f"Intento {intento}/{max_intentos} con '{modelo}' fallo: {mensaje}")
                time.sleep(5)

    print("ADVERTENCIA: no se pudo extraer el dato del PDF con ningun modelo disponible.")
    return None
