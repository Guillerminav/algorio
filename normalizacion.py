"""Normalizacion de texto/fecha compartida entre data_pipeline/ (al guardar
cada boletin nuevo) y backend/ (al leer, como red de seguridad extra para
datos historicos guardados antes de que esto se aplicara tambien al guardar).
"""
import re
import unicodedata
from typing import Optional


def _normalizar_texto(valor: Optional[str]) -> str:
    """Quita tildes/puntuacion y pasa a mayusculas, para comparar texto libre que
    cada fuente escribe distinto (ej. 'Iguazú' vs 'IGUAZU')."""
    if not valor:
        return ""
    sin_tildes = "".join(
        c for c in unicodedata.normalize("NFD", valor) if unicodedata.category(c) != "Mn"
    )
    limpio = re.sub(r"[.,]", "", sin_tildes).upper()
    return re.sub(r"\s+", " ", limpio).strip()


def normalizar_estacion(nombre: Optional[str]) -> str:
    """Normaliza un nombre de estacion para poder cruzar INA con Prefectura Naval."""
    return _normalizar_texto(nombre)


# Nombre "bonito" (con tildes y mayusculas/minusculas correctas) por rio
# normalizado. Prefectura Naval manda todo en MAYUSCULAS sin tildes; INA a
# veces si trae tildes. Se unifica a esta grafia sin importar de que fuente
# vino el dato. Si aparece un rio nuevo que no esta mapeado, se usa Title Case
# como mejor esfuerzo (no puede inventar tildes que ninguna fuente mando).
RIOS_CANONICOS = {
    "PARANA": "Paraná",
    "PARAGUAY": "Paraguay",
    "URUGUAY": "Uruguay",
    "IGUAZU": "Iguazú",
    "ALTO PARANA": "Alto Paraná",
    "PARANA / IGUAZU": "Paraná / Iguazú",
    # "Paraná/Delta" (como lo escribe INA) y "Delta Paraná" (como lo escribe
    # Prefectura Naval) son el mismo tramo; se unifican a esta unica grafia.
    "PARANA/DELTA": "Delta Paraná",
    "DE LA PLATA": "De la Plata",
    "DELTA PARANA": "Delta Paraná",
    "GUALEGUAY": "Gualeguay",
    "GUALEGUAYCHU": "Gualeguaychú",
    "IBICUY": "Ibicuy",
    "SAN JAVIER": "San Javier",
}


def canonizar_rio(nombre: Optional[str]) -> Optional[str]:
    """Unifica el nombre de un rio a una unica grafia sin importar la fuente."""
    # isinstance(..., float) cubre NaN sin depender de pandas: esta funcion se
    # usa tanto sobre dicts sueltos (data_pipeline, al guardar) como sobre
    # columnas de un DataFrame (backend/datos.py, al leer), donde un valor
    # faltante llega como float('nan') en vez de None.
    if not nombre or isinstance(nombre, float):
        return None
    return RIOS_CANONICOS.get(_normalizar_texto(nombre), nombre.title())


# A diferencia de los rios (un puñado de valores conocidos), las estaciones
# son muchas y no hay un diccionario armado a mano: se usa Title Case como
# mejor esfuerzo. Esto arregla el caso mas comun (mayusculas vs mayusculas/
# minusculas, ej. "CORRIENTES" -> "Corrientes"), pero si una estacion viene
# SOLO de una fuente que manda mayusculas sin tildes (ej. Prefectura Naval),
# no puede restituir una tilde que ningun lado mando (mismo limite que
# canonizar_rio antes de tener RIOS_CANONICOS). Si aparece un caso asi, se
# puede sumar un diccionario ESTACIONES_CANONICAS analogo a RIOS_CANONICOS.
def canonizar_estacion(nombre: Optional[str]) -> Optional[str]:
    if not nombre or isinstance(nombre, float):
        return None
    return nombre.title()


def normalizar_fecha(fecha_boletin: Optional[str]) -> Optional[str]:
    """Unifica el separador de fecha a '-' (ISO). La unica fuente que use
    otro separador hasta ahora fue INA, que a veces devuelve '/' en vez de
    '-' (ver ina.py)."""
    if not fecha_boletin:
        return fecha_boletin
    return fecha_boletin.replace("/", "-")
