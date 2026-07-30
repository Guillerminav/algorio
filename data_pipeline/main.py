"""Orquestador del pipeline: corre todas las fuentes registradas, guarda cada una
en su CSV propio y al final reconstruye el dataset historico unificado.

Uso (desde la carpeta algorio/, con el entorno virtual activado):
    python -m data_pipeline.main
"""
from datetime import date, datetime, timedelta
from types import ModuleType
from typing import Optional

from data_pipeline.sources import ina, itaipu, prefectura_naval, yacyreta  # noqa: F401 (itaipu: ver nota abajo)
from data_pipeline.storage.per_source import existe_boletin, guardar_filas_fuente
from data_pipeline.storage.unify import actualizar_historico

# Cada fuente es un modulo de sources/ con las mismas funciones y constantes:
# NOMBRE, COLUMNAS_CLAVE, construir_url(fecha), obtener_contenido(url),
# extraer(contenido), a_filas(datos). Para sumar una fuente nueva: crear ese
# modulo y agregarlo a esta lista, sin tocar el resto del pipeline.
#
# Una fuente cuya URL depende de la fecha (como INA) puede declarar ademas
# DIAS_ATRAS_SI_FALTA (ver sources/ina.py): si el boletin de hoy todavia no
# esta publicado, se prueba automaticamente con los dias anteriores.
#
# Itaipu queda en pausa: Itaipu Binacional movio su boletin hidrologico a un
# link de SharePoint con acceso restringido (ni siquiera el boton oficial de
# su propio sitio sirve el PDF a un request sin sesion). El modulo
# sources/itaipu.py queda listo para reactivar si aparece una URL publica
# real o credenciales de acceso.
FUENTES: list[ModuleType] = [
    ina,
    yacyreta,
    prefectura_naval,
]


def ejecutar_fuente(fuente: ModuleType, fecha: date) -> Optional[str]:
    """Corre el pipeline completo (descargar -> extraer -> guardar) para una fuente.

    Si la fuente declara DIAS_ATRAS_SI_FALTA, prueba primero con la fecha de
    hoy y, si el boletin todavia no esta publicado, retrocede dia por dia
    hasta encontrar el ultimo disponible (o agotar los intentos).
    """
    dias_atras_max = getattr(fuente, "DIAS_ATRAS_SI_FALTA", 0)

    contenido = None
    url = None
    for dias_atras in range(dias_atras_max + 1):
        fecha_intento = fecha - timedelta(days=dias_atras)

        # Solo aplica a fuentes que reintentan hacia atras (DIAS_ATRAS_SI_FALTA,
        # hoy unicamente INA: su URL depende de la fecha). Yacyreta y
        # Prefectura Naval siempre traen "lo ultimo publicado" de una URL fija
        # sin importar la fecha, asi que a ellas no les aplica este chequeo.
        if dias_atras_max > 0 and existe_boletin(fuente.NOMBRE, fecha_intento.isoformat()):
            print(f"[{fuente.NOMBRE}] ya tenemos el boletin de {fecha_intento} en la base, no hace falta volver a pedirlo.")
            return None

        url = fuente.construir_url(fecha_intento)
        print(f"[{fuente.NOMBRE}] consultando {url}")
        contenido = fuente.obtener_contenido(url)
        if contenido is not None:
            break
        if dias_atras < dias_atras_max:
            print(f"[{fuente.NOMBRE}] todavia no esta publicado el boletin de {fecha_intento}, pruebo el dia anterior...")

    if contenido is None:
        print(f"[{fuente.NOMBRE}] no se pudo obtener contenido, se omite esta corrida.")
        return None

    datos = fuente.extraer(contenido)
    filas = fuente.a_filas(datos)

    # Bookkeeping comun a toda fuente: cuando se extrajo el dato y de que URL
    # exacta (las fuentes publican en horarios y con links distintos cada dia).
    # url_origen se pone con setdefault: una fuente que haya usado una URL
    # distinta a la de construir_url() (ej. prefectura_naval, que cae a un
    # sitio de respaldo si el oficial no responde) ya la declaro en sus filas.
    fecha_extraccion = datetime.now().isoformat(timespec="seconds")
    for fila in filas:
        fila["fecha_extraccion"] = fecha_extraccion
        fila.setdefault("url_origen", url)

    guardar_filas_fuente(filas, fuente.NOMBRE, columnas_clave=fuente.COLUMNAS_CLAVE)
    return url


def main() -> None:
    fecha = date.today()

    for fuente in FUENTES:
        try:
            ejecutar_fuente(fuente, fecha)
        except Exception as e:
            print(f"[{fuente.NOMBRE}] fallo la corrida completa: {e}")

    actualizar_historico()


if __name__ == "__main__":
    main()
