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
    return RIOS_CANONICOS.get(_normalizar_texto(nombre)) or titulo_es(nombre)


# Palabras que en castellano van en minuscula dentro de un nombre propio
# (salvo que sean la primera): "Concepcion del Uruguay", no "Del".
PALABRAS_MENORES = {"de", "del", "la", "las", "los", "el", "y", "e", "en", "a"}


def titulo_es(texto: str) -> str:
    """Title case con las reglas del castellano, respetando parentesis."""
    salida = []
    for i, palabra in enumerate(texto.split()):
        nucleo = palabra.strip("()")
        izquierda = palabra[: len(palabra) - len(palabra.lstrip("("))]
        derecha = palabra[len(palabra.rstrip(")")):]
        minuscula = nucleo.lower()
        if i > 0 and minuscula in PALABRAS_MENORES:
            formateado = minuscula
        else:
            formateado = minuscula[:1].upper() + minuscula[1:]
        salida.append(f"{izquierda}{formateado}{derecha}")
    return " ".join(salida)


# Registro canonico de estaciones: clave normalizada -> (nombre, rio).
#
# Hace falta porque las fuentes escriben la misma estacion de formas
# distintas y NINGUNA fila alcanza por si sola para resolverlo:
#   - Mayusculas: Prefectura manda "ROSARIO", INA "Rosario".
#   - Tildes: "ITUZAINGO" vs "Ituzaingó". Una tilde que ninguna fuente mando
#     no se puede inventar, asi que el nombre de aca sale de la variante con
#     mas tildes que se haya visto entre todas las fuentes.
#   - Rios distintos para la misma estacion: "Rosario" figura en Paraná y en
#     "Paraná/Delta". Se toma el nombre de rio mas corto (criterio acordado:
#     el mas corto suele ser el rio principal, no el tramo).
#
# Generado a partir de los datos ya guardados; si aparece una estacion nueva
# que no este aca, canonizar_estacion() cae a titulo_es() como mejor esfuerzo
# (arregla mayusculas, no puede restituir tildes ausentes).
ESTACIONES_CANONICAS = {
    'ALBA POSSE': ('Alba Posse', 'Uruguay'),
    'ALVEAR': ('Alvear', 'Uruguay'),
    'ANDRESITO': ('Andresito', 'Iguazú'),
    'ATALAYA': ('Atalaya', 'De la Plata'),
    'BARADERO': ('Baradero', 'Delta Paraná'),
    'BARRANQUERAS': ('Barranqueras', 'Paraná'),
    'BELLA VISTA': ('Bella Vista', 'Paraná'),
    'BERMEJO': ('Bermejo', 'Paraguay'),
    'BOCA GUALEGUAYCHU': ('Boca Gualeguaychú', 'Uruguay'),
    'BOMPLAND': ('Bompland', 'Uruguay'),
    'BOUVIER': ('Bouvier', 'Paraguay'),
    'BRAGA': ('Braga', 'De la Plata'),
    'BUENOS AIRES': ('Buenos Aires', 'De la Plata'),
    'CAMPANA': ('Campana', 'Delta Paraná'),
    'CAMPICHUELO': ('Campichuelo', 'Uruguay'),
    'CANAL NUEVO': ('Canal Nuevo', 'Delta Paraná'),
    'CAXIA (BRASIL)': ('Caxia (Brasil)', 'Iguazú'),
    'CHANA MINI': ('Chana Mini', 'Delta Paraná'),
    'COLON': ('Colon', 'Uruguay'),
    'CONCEP DEL URUGUAY': ('Concep. del Uruguay', 'Uruguay'),
    'CONCEPCION DEL URUGUAY': ('Concepción del Uruguay', 'Uruguay'),
    'CONCORDIA': ('Concordia', 'Uruguay'),
    'CONFLUENCIA': ('Confluencia', 'Paraná / Iguazú'),
    'CORRIENTES': ('Corrientes', 'Paraná'),
    'DIAMANTE': ('Diamante', 'Paraná'),
    'DIQUE LUJAN': ('Dique Lujan', 'Delta Paraná'),
    'EL SOBERBIO': ('El Soberbio', 'Uruguay'),
    'ELDORADO': ('Eldorado', 'Paraná'),
    'EMPEDRADO': ('Empedrado', 'Paraná'),
    'ESCOBAR': ('Escobar', 'Delta Paraná'),
    'ESQUINA': ('Esquina', 'Paraná'),
    'FEDERACION': ('Federacion', 'Uruguay'),
    'FEDERACION EMBALSE': ('Federacion Embalse', 'Uruguay'),
    'FORMOSA': ('Formosa', 'Paraguay'),
    'GARRUCHOS': ('Garruchos', 'Uruguay'),
    'GOYA': ('Goya', 'Paraná'),
    'GUAIRA': ('Guairá', 'Alto Paraná'),
    'GUALEGUAYCHU': ('Gualeguaychu', 'Gualeguaychú'),
    'GUAYRA (BRASIL)': ('Guayra (Brasil)', 'Paraná'),
    'GUAZUCITO': ('Guazucito', 'Delta Paraná'),
    'HERNANDARIAS': ('Hernandarias', 'Paraná'),
    'IBICUY': ('Ibicuy', 'Ibicuy'),
    'IGUAZU': ('Iguazú', 'Iguazú'),
    'ISLA DEL CERRITO': ('Isla del Cerrito', 'Paraguay'),
    'ITA IBATE': ('Ita Ibate', 'Paraná'),
    'ITAIPU': ('Itaipú', 'Alto Paraná'),
    'ITATI': ('Itati', 'Paraná'),
    'ITUZAINGO': ('Ituzaingó', 'Paraná'),
    'LA CALERA': ('La Calera', 'Uruguay'),
    'LA CRUZ': ('La Cruz', 'Uruguay'),
    'LA PAZ': ('La Paz', 'Paraná'),
    'LA PLATA': ('La Plata', 'De la Plata'),
    'LAS PALMAS': ('Las Palmas', 'Paraguay'),
    'LIBERTAD': ('Libertad', 'Paraná'),
    'LIBERTADOR': ('Libertador', 'Paraná'),
    'MARTIN GARCIA': ('Martin Garcia', 'Delta Paraná'),
    'MOCORETA': ('Mocoreta', 'Uruguay'),
    'MONTE CASEROS': ('Monte Caseros', 'Uruguay'),
    'OLIVOS': ('Olivos', 'Delta Paraná'),
    'PANAMBI': ('Panambi', 'Uruguay'),
    'PARANA': ('Paraná', 'Paraná'),
    'PARANACITO': ('Paranacito', 'Uruguay'),
    'PASO DE LA PATRIA': ('Paso de la Patria', 'Paraná'),
    'PASO DE LOS LIBRES': ('Paso de los Libres', 'Uruguay'),
    'PILCOMAYO': ('Pilcomayo', 'Paraguay'),
    'POSADAS': ('Posadas', 'Paraná'),
    'PTO GUALEGUAYCHU': ('Pto. Gualeguaychú', 'Uruguay'),
    'PUERTO CONCEPCION': ('Puerto Concepcion', 'Uruguay'),
    'PUERTO FORMOSA': ('Puerto Formosa', 'Paraguay'),
    'PUERTO IGUAZU': ('Puerto Iguazú', 'Paraná'),
    'PUERTO MANI': ('Puerto Mani', 'Paraná'),
    'PUERTO PILCOMAYO': ('Puerto Pilcomayo', 'Paraguay'),
    'PUERTO RUIZ': ('Puerto Ruiz', 'Gualeguay'),
    'RAMALLO': ('Ramallo', 'Paraná'),
    'RECONQUISTA': ('Reconquista', 'Paraná'),
    'REPRESA CAPANEMA (BRASIL)': ('Represa Capanema (Brasil)', 'Iguazú'),
    'REPRESA ITAIPU (BRASIL)': ('Represa Itaipu (Brasil)', 'Paraná'),
    'ROSARIO': ('Rosario', 'Paraná'),
    'SALTO GRANDE ABAJO': ('Salto Grande Abajo', 'Uruguay'),
    'SALTO GRANDE ARRIBA': ('Salto Grande Arriba', 'Uruguay'),
    'SAN FERNANDO': ('San Fernando', 'Lujan'),
    'SAN ISIDRO': ('San Isidro', 'Delta Paraná'),
    'SAN JAVIER': ('San Javier', 'Uruguay'),
    'SAN JAVIER (SANTA FE)': ('San Javier (Santa Fe)', 'San Javier'),
    'SAN LORENZO': ('San Lorenzo', 'Paraná'),
    'SAN NICOLAS': ('San Nicolás', 'Paraná'),
    'SAN PEDRO': ('San Pedro', 'Delta Paraná'),
    'SANTA ANA': ('Santa Ana', 'Paraná'),
    'SANTA ELENA': ('Santa Elena', 'Paraná'),
    'SANTA FE': ('Santa Fe', 'Paraná'),
    'SANTA TERESITA': ('Santa Teresita', 'De la Plata'),
    'SANTO TOME': ('Santo Tomé', 'Uruguay'),
    'TIGRE': ('Tigre', 'Delta Paraná'),
    'VICTORIA': ('Victoria', 'Paraná'),
    'VILLA CONSTITUCION': ('Villa Constitución', 'Paraná'),
    'YACYRETA AFLUENTE': ('Yacyretá Afluente', 'Paraná'),
    'YACYRETA EFLUENTE': ('Yacyretá Efluente', 'Paraná'),
    'YAPEYU': ('Yapeyu', 'Uruguay'),
    'YERUA': ('Yerua', 'Uruguay'),
    'ZARATE': ('Zarate', 'Delta Paraná'),
}


def canonizar_estacion(nombre: Optional[str]) -> Optional[str]:
    if not nombre or isinstance(nombre, float):
        return None
    entrada = ESTACIONES_CANONICAS.get(_normalizar_texto(nombre))
    return entrada[0] if entrada else titulo_es(nombre)


def rio_de_estacion(estacion: Optional[str], rio: Optional[str]) -> Optional[str]:
    """Rio canonico de una estacion. Si la estacion esta en el registro, gana
    el rio de ahi (el mas corto entre los observados), sin importar cual haya
    mandado esta fila puntual; si no, se normaliza el que vino."""
    if estacion and not isinstance(estacion, float):
        entrada = ESTACIONES_CANONICAS.get(_normalizar_texto(estacion))
        if entrada and entrada[1]:
            return entrada[1]
    return canonizar_rio(rio)


def normalizar_fecha(fecha_boletin: Optional[str]) -> Optional[str]:
    """Unifica cualquier fecha a formato ISO 'YYYY-MM-DD', sin importar el
    separador ('/' o '-') ni el orden en que la mande la fuente.

    INA es la unica fuente que no manda ISO directo, y ademas no es
    consistente: el sistema viejo (ina.gov.ar) devolvia 'YYYY/MM/DD', el
    nuevo (alerta.ina.gob.ar) muestra la fecha como la escribe la pagina,
    'DD/MM/YYYY' (formato argentino) — Gemini extrae el texto tal cual esta
    impreso en el reporte, no lo convierte. Un simple replace('/', '-') solo
    arregla el separador y deja el orden de dia/mes/anio como vino, por
    eso hace falta mirar cual de las tres partes tiene 4 digitos (el anio)
    para saber como reordenar.
    """
    if not fecha_boletin:
        return fecha_boletin

    partes = re.split(r"[/-]", fecha_boletin.strip())
    if len(partes) != 3:
        return fecha_boletin  # formato inesperado: se deja como vino, mejor no inventar.

    if len(partes[0]) == 4:
        anio, mes, dia = partes
    elif len(partes[2]) == 4:
        dia, mes, anio = partes
    else:
        return fecha_boletin  # ninguna parte parece un anio de 4 digitos.

    try:
        return f"{int(anio):04d}-{int(mes):02d}-{int(dia):02d}"
    except ValueError:
        return fecha_boletin
