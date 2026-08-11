"""Rutas guardadas por el usuario y el calculo de si su embarcacion puede
hacerlas: hasta que calado puede salir y cuantas toneladas puede cargar.

El calculo, en cuatro pasos:

1. Calado disponible en cada estacion de la ruta. Las fuentes dan altura
   hidrometrica, no profundidad, asi que se le suma la profundidad garantizada
   del tramo (backend/tramos_navegacion.py) y se le resta el resguardo bajo
   quilla:

       calado_disponible = profundidad_garantizada + nivel_actual - resguardo

2. Punto critico. El calado de la ruta lo define la estacion mas restrictiva,
   no el promedio: es el minimo de todas. Esa estacion es el punto critico.

3. Calado operativo. El menor entre lo que da el rio y el calado maximo de la
   propia embarcacion (con toda el agua del mundo, un Handymax no se hunde mas
   alla de sus 34 pies de diseño).

4. Carga, anclada en el calado de diseño, que es el razonamiento del operador
   ("cada pie que pierdo son 1.600 toneladas menos"):

       carga = DWT - (calado_maximo - calado_operativo) * toneladas_por_pie

   Es una relacion lineal, valida cerca de la linea de flotacion cargada, que
   es justo donde se opera. No sirve para extrapolar hasta el buque en rosca.

Si la ruta no tiene embarcacion asociada, los pasos 3 y 4 no corren: se
muestran los niveles y el punto critico del rio, pero no hay veredicto de
calado ni de toneladas. Es a proposito: sin las caracteristicas del buque no
hay nada contra que comparar.
"""
import re
from datetime import datetime
from typing import Optional

from psycopg.types.json import Json

from backend.tramos_navegacion import (
    CATEGORIAS,
    DWT_BARCAZA_T,
    ESTACIONES_APTAS_OCEANICOS,
    METROS_POR_PIE,
    PIES_POR_METRO,
    PLANTILLAS,
    RESGUARDO_FLUVIAL_PIES,
    RESGUARDO_OCEANICO_PIES,
    TON_POR_PIE_BARCAZA,
    tramo_de_estacion,
)
from db import conexion, inicializar_db
from normalizacion import normalizar_estacion

# Una estacion cuyo calado disponible esta a menos de esto del punto critico
# se marca como "ajustada": hoy no limita, pero con una bajante chica pasa a
# limitar. Sirve para no mirar solo la estacion peor.
MARGEN_AJUSTADO_M = 0.20

SENTIDOS_VALIDOS = {"ascendente", "descendente"}


# --------------------------------------------------------------------------
# Parseo de la ficha de la embarcacion
#
# Los campos de caracteristicas son texto libre editable (ver activos.py), y la
# tabla de referencia mezcla formatos: numeros limpios ("34.0"), miles a la
# española ("2.000" = dos mil), rangos ("65.000-80.000"), equivalencias entre
# parentesis ("10.5 (≈3.2 m)") y texto puro ("N/A", "Según línea de carga").
# --------------------------------------------------------------------------

_PARENTESIS = re.compile(r"\(([^)]*)\)")
_NUMERO = re.compile(r"\d+(?:[.,]\d+)*")


def _a_float(token: str) -> Optional[float]:
    """Convierte un numero suelto respetando la notacion española.

    El punto es ambiguo: en "2.000" separa miles y en "18.5" es decimal. La
    regla: si todos los grupos despues del primer punto tienen exactamente
    tres digitos, es separador de miles. La coma siempre es decimal.
    """
    token = token.strip()
    if not token:
        return None
    if "," in token:
        try:
            return float(token.replace(".", "").replace(",", "."))
        except ValueError:
            return None
    partes = token.split(".")
    if len(partes) > 1 and all(len(p) == 3 for p in partes[1:]):
        return float("".join(partes))
    try:
        return float(token)
    except ValueError:
        return None


def _numeros(texto: str) -> list[float]:
    """Numeros del texto ignorando lo que este entre parentesis (que suele ser
    una aclaracion o una equivalencia, no el valor)."""
    sin_parentesis = _PARENTESIS.sub(" ", str(texto))
    return [n for n in (_a_float(t) for t in _NUMERO.findall(sin_parentesis)) if n is not None]


def _primer_numero(texto) -> Optional[float]:
    if not texto:
        return None
    numeros = _numeros(texto)
    return numeros[0] if numeros else None


def _rango(texto) -> tuple[Optional[float], Optional[float]]:
    """(minimo, maximo) para los campos que vienen como rango, como el DWT."""
    if not texto:
        return (None, None)
    numeros = _numeros(texto)
    if not numeros:
        return (None, None)
    return (min(numeros), max(numeros))


def _calado_pies(texto) -> Optional[float]:
    """Calado maximo en pies.

    Casi siempre viene en pies y el parentesis es solo la equivalencia
    ("10.5 (≈3.2 m)"). La excepcion es cuando los unicos numeros estan adentro
    del parentesis y en metros ("Variable operativo (2.0-2.5 m)"): ahi se toma
    el mayor y se convierte, porque leerlo como pies subestimaria el calado a
    menos de un tercio del real.
    """
    if not texto:
        return None
    afuera = _primer_numero(texto)
    if afuera is not None:
        return afuera
    for contenido in _PARENTESIS.findall(str(texto)):
        numeros = [n for n in (_a_float(t) for t in _NUMERO.findall(contenido)) if n is not None]
        if not numeros:
            continue
        valor = max(numeros)
        en_metros = re.search(r"(?:\bm\b|metros)", contenido, re.IGNORECASE)
        return round(valor * PIES_POR_METRO, 2) if en_metros else valor
    return None


def caracteristicas_embarcacion(activo: dict, cantidad_barcazas: Optional[int]) -> dict:
    """Traduce la ficha de texto libre del activo a los numeros que necesita el
    calculo, resolviendo el caso del convoy (donde la ficha describe una unidad
    y la ruta define de cuantas barcazas esta armado)."""
    categoria = activo.get("categoria_embarcacion") or ""
    flags = CATEGORIAS.get(categoria, {})
    es_convoy = flags.get("es_convoy", False)
    por_defecto = flags.get("barcazas_por_defecto", 1)

    calado_max_pies = _calado_pies(activo.get("calado_max_pies"))
    ton_por_pie = _primer_numero(activo.get("ton_por_pie"))
    dwt_min, dwt_max = _rango(activo.get("dwt_capacidad_t"))

    # El convoy grande trae el DWT del convoy entero y "N/A" en toneladas por
    # pie (la ficha dice, textual, que se calcula por barcaza): se reconstruye
    # a partir de la barcaza tipo.
    if es_convoy and ton_por_pie is None:
        ton_por_pie = TON_POR_PIE_BARCAZA * por_defecto
    if es_convoy and dwt_max is None:
        dwt_min = dwt_max = DWT_BARCAZA_T * por_defecto

    # La ficha describe `por_defecto` barcazas; la ruta puede armar el convoy
    # con otra cantidad, y tanto el DWT como las toneladas por pie escalan.
    barcazas = cantidad_barcazas if (es_convoy and cantidad_barcazas) else por_defecto
    factor = barcazas / por_defecto if es_convoy and por_defecto else 1
    if factor != 1:
        ton_por_pie = ton_por_pie * factor if ton_por_pie is not None else None
        dwt_min = dwt_min * factor if dwt_min is not None else None
        dwt_max = dwt_max * factor if dwt_max is not None else None

    faltantes = []
    if calado_max_pies is None:
        faltantes.append("calado máximo")
    if ton_por_pie is None:
        faltantes.append("toneladas por pie")
    if dwt_max is None:
        faltantes.append("DWT")

    return {
        "activo_id": activo.get("id"),
        "nombre": activo.get("nombre"),
        "categoria_embarcacion": categoria or None,
        "oceanico": flags.get("oceanico", False),
        "es_convoy": es_convoy,
        "cantidad_barcazas": barcazas if es_convoy else None,
        "calado_max_pies": calado_max_pies,
        "calado_max_m": round(calado_max_pies * METROS_POR_PIE, 2) if calado_max_pies else None,
        "ton_por_pie": ton_por_pie,
        "dwt_min_t": dwt_min,
        "dwt_max_t": dwt_max,
        "faltantes": faltantes,
    }


def _a_profundidad(valor) -> Optional[float]:
    """Profundidad propia cargada por el usuario, en pies. Descarta lo que no
    sea un numero positivo: un 0 o un negativo no es una correccion, es un
    campo a medio escribir, y dejarlo pasar daria un calado disponible falso."""
    try:
        numero = float(valor)
    except (TypeError, ValueError):
        return None
    return numero if numero > 0 else None


def resguardo_por_defecto_pies(embarcacion: Optional[dict]) -> float:
    if embarcacion and embarcacion.get("oceanico"):
        return RESGUARDO_OCEANICO_PIES
    return RESGUARDO_FLUVIAL_PIES


# --------------------------------------------------------------------------
# Calculo
# --------------------------------------------------------------------------

def calcular_ruta(ruta: dict, activo: Optional[dict], mapa_estado: dict) -> dict:
    """Enriquece una ruta guardada con el estado de cada estacion del trayecto,
    el punto critico y (si tiene embarcacion) el calado operativo y la carga.

    `mapa_estado` es el resultado de datos.mapa_estado_estaciones(), que se
    calcula una sola vez y se reusa para todas las rutas del usuario: recorre
    el dataset entero y es lo caro de toda la operacion.
    """
    embarcacion = (
        caracteristicas_embarcacion(activo, ruta.get("cantidad_barcazas")) if activo else None
    )

    resguardo_pies = ruta.get("resguardo_quilla_pies")
    if resguardo_pies is None:
        resguardo_pies = resguardo_por_defecto_pies(embarcacion)
    resguardo_m = resguardo_pies * METROS_POR_PIE

    # La profundidad garantizada de la tabla es un valor sugerido, no un dato
    # firme: el rio cambia y el operador que esta en el muelle se entera antes
    # que nosotros. Lo que haya cargado a mano para ese tramo pisa al sugerido.
    propias = ruta.get("profundidades_pies") or {}

    estaciones = ruta.get("estaciones") or []
    detalle = []
    for nombre in estaciones:
        clave = normalizar_estacion(nombre)
        estado = mapa_estado.get(clave)
        id_tramo, tramo = tramo_de_estacion(clave)

        nivel = estado["nivel_actual_m"] if estado else None
        profundidad_sugerida = tramo["profundidad_garantizada_pies"] if tramo else None
        profundidad_propia = _a_profundidad(propias.get(id_tramo)) if id_tramo else None
        profundidad_pies = profundidad_propia if profundidad_propia is not None else profundidad_sugerida

        calado_disponible_m = None
        motivo = None
        if nivel is None:
            motivo = "Sin lectura de nivel para esta estación."
        elif profundidad_pies is None:
            motivo = (
                tramo["descripcion"] if tramo and not tramo["navegable"]
                else "Sin profundidad de referencia cargada para esta estación."
            )
        else:
            calado_disponible_m = round(profundidad_pies * METROS_POR_PIE + nivel - resguardo_m, 2)

        detalle.append({
            "estacion": estado["estacion"] if estado else nombre,
            "rio": estado["rio"] if estado else None,
            "nivel_actual_m": nivel,
            "tendencia": estado["tendencia"] if estado else None,
            "tendencia_diferencia_m": estado["tendencia_diferencia_m"] if estado else None,
            "fecha_boletin": estado["fecha_boletin"] if estado else None,
            "tramo": id_tramo,
            "tramo_nombre": tramo["nombre"] if tramo else None,
            "profundidad_garantizada_pies": profundidad_pies,
            "profundidad_sugerida_pies": profundidad_sugerida,
            "profundidad_es_propia": profundidad_propia is not None,
            "calado_disponible_m": calado_disponible_m,
            "calado_disponible_pies": (
                round(calado_disponible_m * PIES_POR_METRO, 1) if calado_disponible_m is not None else None
            ),
            "motivo_sin_calado": motivo,
            "veredicto": "sin_datos" if calado_disponible_m is None else "ok",
        })

    con_calado = [d for d in detalle if d["calado_disponible_m"] is not None]
    calado_ruta_m = min((d["calado_disponible_m"] for d in con_calado), default=None)

    punto_critico = None
    for d in con_calado:
        margen = round(d["calado_disponible_m"] - calado_ruta_m, 2)
        d["margen_sobre_critico_m"] = margen
        if margen <= 0.005:
            d["veredicto"] = "critico"
            if punto_critico is None:
                punto_critico = d
        elif margen < MARGEN_AJUSTADO_M:
            d["veredicto"] = "ajustado"

    resultado = {
        **ruta,
        "embarcacion": embarcacion,
        "resguardo_quilla_pies": resguardo_pies,
        "estaciones_detalle": detalle,
        "estaciones_sin_datos": len(detalle) - len(con_calado),
        # Un renglon por tramo que toca la ruta: es lo que la pantalla lista
        # con el lapiz al lado para poder pisar la profundidad sugerida.
        "tramos_usados": _tramos_usados(detalle),
        "punto_critico": (
            {k: punto_critico[k] for k in ("estacion", "rio", "nivel_actual_m", "tendencia",
                                           "calado_disponible_m", "calado_disponible_pies")}
            if punto_critico else None
        ),
        "calado_ruta_m": calado_ruta_m,
        "calado_ruta_pies": round(calado_ruta_m * PIES_POR_METRO, 1) if calado_ruta_m is not None else None,
        "calado_operativo_pies": None,
        "calado_operativo_m": None,
        "limitado_por": None,
        "carga_min_t": None,
        "carga_max_t": None,
        "dwt_min_t": embarcacion["dwt_min_t"] if embarcacion else None,
        "dwt_max_t": embarcacion["dwt_max_t"] if embarcacion else None,
        "aprovechamiento_pct": None,
        "toneladas_por_cm": None,
        "faltante_cm": None,
        "faltante_para": None,
        # Si el usuario no cargo un resguardo propio, arriba se resolvio al
        # default segun el tipo de embarcacion; esto deja ver cual de los dos
        # se uso sin tener que adivinarlo comparando numeros.
        "resguardo_es_propio": ruta.get("resguardo_quilla_pies") is not None,
        "advertencias": [],
    }

    _agregar_advertencias_de_datos(resultado, detalle, con_calado)

    if embarcacion is None:
        resultado["veredicto"] = "sin_embarcacion"
        return resultado
    if calado_ruta_m is None:
        resultado["veredicto"] = "sin_datos"
        return resultado

    _calcular_carga(resultado, embarcacion, calado_ruta_m)
    _agregar_advertencias_de_embarcacion(resultado, embarcacion, detalle)
    return resultado


def _tramos_usados(detalle: list[dict]) -> list[dict]:
    """Los tramos que atraviesa la ruta, en el orden en que se recorren, con la
    profundidad que se esta usando y de donde salio (sugerida o propia)."""
    tramos: dict[str, dict] = {}
    for d in detalle:
        if not d["tramo"]:
            continue
        entrada = tramos.setdefault(d["tramo"], {
            "tramo": d["tramo"],
            "nombre": d["tramo_nombre"],
            "profundidad_pies": d["profundidad_garantizada_pies"],
            "profundidad_sugerida_pies": d["profundidad_sugerida_pies"],
            "es_propia": d["profundidad_es_propia"],
            "estaciones": [],
        })
        entrada["estaciones"].append(d["estacion"])
    return list(tramos.values())


def _calcular_carga(resultado: dict, embarcacion: dict, calado_ruta_m: float) -> None:
    """Pasos 3 y 4: calado operativo y toneladas. Escribe sobre `resultado`."""
    calado_max_pies = embarcacion["calado_max_pies"]
    ton_por_pie = embarcacion["ton_por_pie"]
    dwt_min, dwt_max = embarcacion["dwt_min_t"], embarcacion["dwt_max_t"]

    calado_ruta_pies = calado_ruta_m * PIES_POR_METRO

    if calado_ruta_m <= 0:
        resultado["calado_operativo_pies"] = 0.0
        resultado["calado_operativo_m"] = 0.0
        resultado["limitado_por"] = "rio"
        resultado["veredicto"] = "inviable"
        resultado["faltante_cm"] = round(-calado_ruta_m * 100)
        resultado["faltante_para"] = "pasar"
        return

    if calado_max_pies is None:
        # Sin calado de diseño no hay con que comparar el agua disponible: se
        # informa lo que da el rio y se pide completar la ficha.
        resultado["veredicto"] = "sin_ficha"
        return

    calado_operativo_pies = min(calado_ruta_pies, calado_max_pies)
    resultado["calado_operativo_pies"] = round(calado_operativo_pies, 1)
    resultado["calado_operativo_m"] = round(calado_operativo_pies * METROS_POR_PIE, 2)
    resultado["limitado_por"] = "embarcacion" if calado_max_pies <= calado_ruta_pies else "rio"

    if ton_por_pie is None or dwt_max is None:
        resultado["veredicto"] = "sin_ficha"
        return

    pies_perdidos = max(0.0, calado_max_pies - calado_operativo_pies)
    perdida_t = pies_perdidos * ton_por_pie
    carga_min = max(0.0, (dwt_min if dwt_min is not None else dwt_max) - perdida_t)
    carga_max = max(0.0, dwt_max - perdida_t)

    resultado["carga_min_t"] = round(carga_min)
    resultado["carga_max_t"] = round(carga_max)
    resultado["dwt_min_t"] = dwt_min
    resultado["dwt_max_t"] = dwt_max
    # Lo que le duele al operador: cuanta carga se juega por cada centimetro de
    # rio. Un pie son 30,48 cm, asi que un centimetro son ton_por_pie/30,48.
    resultado["toneladas_por_cm"] = round(ton_por_pie * 0.0328084, 1)
    resultado["aprovechamiento_pct"] = round(carga_max / dwt_max * 100) if dwt_max else None

    # Cuanto le falta de agua al punto critico, que es lo primero que pregunta
    # el que recibe el aviso. La pregunta cambia segun el caso: si la ruta ya
    # navega pero con menos carga, falta agua para salir a calado pleno; si no
    # puede levantar nada, falta agua para empezar a cargar.
    if carga_max <= 0:
        resultado["veredicto"] = "sin_carga"
        calado_carga_cero = calado_max_pies - dwt_max / ton_por_pie
        resultado["faltante_cm"] = round((calado_carga_cero - calado_operativo_pies) * 30.48)
        resultado["faltante_para"] = "cargar"
    elif resultado["limitado_por"] == "embarcacion":
        resultado["veredicto"] = "viable"
    else:
        resultado["veredicto"] = "limitada"
        resultado["faltante_cm"] = round(pies_perdidos * 30.48)
        resultado["faltante_para"] = "calado_pleno"


def _agregar_advertencias_de_datos(resultado: dict, detalle: list[dict], con_calado: list[dict]) -> None:
    sin_datos = [d["estacion"] for d in detalle if d["calado_disponible_m"] is None]
    if sin_datos:
        resultado["advertencias"].append(
            f"{len(sin_datos)} estación/es del trayecto no aportan calado "
            f"({', '.join(sin_datos[:4])}{'…' if len(sin_datos) > 4 else ''}): "
            "el cálculo usa solo las que sí tienen dato."
        )
    critico_bajando = [d for d in con_calado if d["veredicto"] == "critico" and d["tendencia"] == "bajando"]
    if critico_bajando:
        d = critico_bajando[0]
        diferencia = d.get("tendencia_diferencia_m")
        detalle_baja = f" ({abs(diferencia) * 100:.0f} cm en el último parte)" if diferencia else ""
        resultado["advertencias"].append(
            f"El punto crítico ({d['estacion']}) viene bajando{detalle_baja}: "
            "el calado calculado puede quedar viejo antes de zarpar."
        )


def _agregar_advertencias_de_embarcacion(resultado: dict, embarcacion: dict, detalle: list[dict]) -> None:
    if embarcacion["faltantes"]:
        resultado["advertencias"].append(
            f"A la ficha de {embarcacion['nombre']} le falta {', '.join(embarcacion['faltantes'])}: "
            "completala en Mi flota para que el cálculo sea completo."
        )

    if embarcacion["oceanico"]:
        fuera = [
            d["estacion"] for d in detalle
            if normalizar_estacion(d["estacion"]) not in ESTACIONES_APTAS_OCEANICOS
        ]
        if fuera:
            resultado["advertencias"].append(
                f"Un buque oceánico no llega físicamente a {', '.join(fuera[:4])}"
                f"{'…' if len(fuera) > 4 else ''}: el tramo navegable termina en el "
                "cordón Timbúes-San Lorenzo (km 460)."
            )

    aprovechamiento = resultado.get("aprovechamiento_pct")
    if embarcacion["es_convoy"] and aprovechamiento is not None and aprovechamiento < 60:
        resultado["advertencias"].append(
            f"Con este calado el convoy aprovecha solo el {aprovechamiento}% de su capacidad: "
            "puede convenir franquear (desarmar el convoy y pasar las barcazas de a tandas)."
        )


# --------------------------------------------------------------------------
# CRUD
# --------------------------------------------------------------------------

def listar_rutas(usuario: str) -> list[dict]:
    inicializar_db()
    with conexion() as con:
        filas = con.execute(
            "SELECT * FROM rutas WHERE usuario = %s ORDER BY creado_en DESC", (usuario,)
        ).fetchall()
    return [dict(f) for f in filas]


def obtener_ruta(ruta_id: int, usuario: str) -> Optional[dict]:
    inicializar_db()
    with conexion() as con:
        fila = con.execute(
            "SELECT * FROM rutas WHERE id = %s AND usuario = %s", (ruta_id, usuario)
        ).fetchone()
    return dict(fila) if fila else None


def _validar(nombre: str, estaciones: list[str], sentido: Optional[str]) -> None:
    if not nombre or not nombre.strip():
        raise ValueError("La ruta necesita un nombre.")
    if not estaciones or len(estaciones) < 2:
        raise ValueError("Una ruta necesita al menos dos estaciones (origen y destino).")
    if sentido and sentido not in SENTIDOS_VALIDOS:
        raise ValueError(f"sentido debe ser uno de {SENTIDOS_VALIDOS}.")


def crear_ruta(
    usuario: str,
    nombre: str,
    estaciones: list[str],
    plantilla: Optional[str] = None,
    activo_id: Optional[int] = None,
    sentido: Optional[str] = None,
    cantidad_barcazas: Optional[int] = None,
    resguardo_quilla_pies: Optional[float] = None,
    profundidades_pies: Optional[dict] = None,
) -> dict:
    _validar(nombre, estaciones, sentido)
    inicializar_db()
    with conexion() as con:
        cursor = con.execute(
            """
            INSERT INTO rutas (usuario, nombre, plantilla, activo_id, estaciones, sentido,
                               cantidad_barcazas, resguardo_quilla_pies, profundidades_pies, creado_en)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
            """,
            (usuario, nombre.strip(), plantilla, activo_id, Json(estaciones), sentido,
             cantidad_barcazas, resguardo_quilla_pies, Json(profundidades_pies or {}),
             datetime.now().isoformat(timespec="seconds")),
        )
        ruta_id = cursor.fetchone()["id"]
    return obtener_ruta(ruta_id, usuario)


def actualizar_ruta(ruta_id: int, usuario: str, cambios: dict) -> dict:
    existente = obtener_ruta(ruta_id, usuario)
    if existente is None:
        raise ValueError("La ruta no existe (o no pertenece a este usuario).")

    _validar(
        cambios.get("nombre", existente["nombre"]),
        cambios.get("estaciones", existente["estaciones"]),
        cambios.get("sentido", existente["sentido"]),
    )

    campos = ["nombre", "plantilla", "activo_id", "estaciones", "sentido",
              "cantidad_barcazas", "resguardo_quilla_pies", "profundidades_pies"]
    columnas_json = {"estaciones", "profundidades_pies"}
    sets, valores = [], []
    for campo in campos:
        if campo in cambios:
            sets.append(f"{campo} = %s")
            valores.append(Json(cambios[campo]) if campo in columnas_json else cambios[campo])

    if sets:
        valores.extend([ruta_id, usuario])
        with conexion() as con:
            con.execute(f"UPDATE rutas SET {', '.join(sets)} WHERE id = %s AND usuario = %s", valores)

    return obtener_ruta(ruta_id, usuario)


def eliminar_ruta(ruta_id: int, usuario: str) -> bool:
    inicializar_db()
    with conexion() as con:
        cursor = con.execute("DELETE FROM rutas WHERE id = %s AND usuario = %s", (ruta_id, usuario))
    return cursor.rowcount > 0


def nombre_de_plantilla(clave: Optional[str]) -> Optional[str]:
    return PLANTILLAS[clave]["nombre"] if clave in PLANTILLAS else None


# --------------------------------------------------------------------------
# Foto del calculo
#
# El analisis se guarda tal como dio cuando se creo (o se edito, o se pidio
# recalcular) la ruta, y al listar se devuelve esa foto sin recalcular. Es lo
# que hace que el punto critico y los niveles de cada estacion sigan siendo
# los mismos que cuando se genero el informe en PDF.
# --------------------------------------------------------------------------

# Campos que el usuario edita: viven en columnas propias y mandan siempre, asi
# que se excluyen de la foto para que un cambio de nombre no quede pisado por
# el valor viejo. El resto del resultado (incluido el resguardo ya resuelto a
# su valor efectivo) si es parte de la foto.
_COLUMNAS_EDITABLES = {
    "id", "usuario", "nombre", "plantilla", "activo_id", "estaciones", "sentido",
    "cantidad_barcazas", "profundidades_pies", "creado_en", "calculo", "calculado_en",
}


def calcular_y_guardar(ruta: dict, activo: Optional[dict], mapa_estado: dict) -> dict:
    """Calcula la ruta y persiste el resultado con la hora en que se saco."""
    resultado = calcular_ruta(ruta, activo, mapa_estado)
    foto = {k: v for k, v in resultado.items() if k not in _COLUMNAS_EDITABLES}

    with conexion() as con:
        fila = con.execute(
            "UPDATE rutas SET calculo = %s, calculado_en = now() WHERE id = %s "
            "RETURNING calculado_en",
            (Json(foto), ruta["id"]),
        ).fetchone()

    return {**resultado, "calculado_en": fila["calculado_en"]}


def con_calculo_guardado(ruta: dict) -> dict:
    """La ruta con su foto ya calculada. `calculo_pendiente` marca las rutas
    guardadas antes de que existiera la foto: no tienen analisis todavia."""
    foto = ruta.get("calculo")
    base = {k: v for k, v in ruta.items() if k != "calculo"}
    if not foto:
        return {**base, "calculo_pendiente": True, "veredicto": "sin_calculo"}
    return {**base, **foto, "calculo_pendiente": False}
