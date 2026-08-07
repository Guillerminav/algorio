"""Tabla de referencia de la via navegable: profundidad garantizada por tramo,
a que tramo pertenece cada estacion, y las rutas principales precargadas.

Por que hace falta: INA y Prefectura Naval publican **altura hidrometrica**
(el nivel respecto del cero de esa escala), no profundidad. Para convertir esa
altura en un calado utilizable hace falta saber cuanta profundidad garantiza
el dragado en ese tramo, referida al mismo cero. Esa constante no la publica
ninguna de las dos fuentes, asi que vive aca.

    calado disponible = profundidad garantizada al cero + altura hidrometrica
                        - resguardo bajo quilla

>>> PENDIENTE: igual que backend/coordenadas_estaciones.py, esta es una tabla
armada a mano en base a las profundidades de dragado publicamente conocidas de
la Hidrovia, NO una carta nautica oficial ni el pliego de la concesion vigente.
Conviene que alguien con expertise real en la via navegable la revise antes de
tomar decisiones de carga con estos numeros. Cada ruta puede sobreescribir el
resguardo bajo quilla; la profundidad del tramo, por ahora, no.

Una estacion que no este en ESTACION_A_TRAMO igual se muestra en la ruta (con
su nivel y su tendencia), pero no aporta un calado disponible: queda como
"sin profundidad de referencia" y no puede ser el punto critico.
"""

PIES_POR_METRO = 3.28084
METROS_POR_PIE = 0.3048


# Profundidad garantizada al cero de escala, por tramo de la via navegable.
# `navegable=False` marca los tramos donde no hay un canal dragado con
# profundidad garantizada (Alto Parana arriba de Posadas: es agua embalsada y
# regulada por Yacyreta/Itaipu, no una via comercial con calado de despacho).
TRAMOS = {
    "oceano_gran_rosario": {
        "nombre": "Océano ➔ Gran Rosario",
        "descripcion": "Río de la Plata y Paraná Inferior, del km 0 al km 460 (Timbúes).",
        "profundidad_garantizada_pies": 34.0,
        "navegable": True,
    },
    "gran_rosario_santa_fe": {
        "nombre": "Gran Rosario ➔ Santa Fe",
        "descripcion": "Paraná km 460 al km 584.",
        "profundidad_garantizada_pies": 25.0,
        "navegable": True,
    },
    "santa_fe_confluencia": {
        "nombre": "Santa Fe ➔ Confluencia",
        "descripcion": "Paraná Medio, km 584 al km 1238.",
        "profundidad_garantizada_pies": 10.0,
        "navegable": True,
    },
    "confluencia_asuncion": {
        "nombre": "Confluencia ➔ Asunción",
        "descripcion": "Río Paraguay, tramo inferior.",
        "profundidad_garantizada_pies": 10.0,
        "navegable": True,
    },
    "asuncion_corumba": {
        "nombre": "Asunción ➔ Corumbá",
        "descripcion": "Río Paraguay, tramo superior. Todavía sin estaciones propias.",
        "profundidad_garantizada_pies": 6.0,
        "navegable": True,
    },
    "alto_parana": {
        "nombre": "Alto Paraná (Confluencia ➔ Posadas)",
        "descripcion": "Paraná entre Corrientes y Posadas/Yacyretá.",
        "profundidad_garantizada_pies": 10.0,
        "navegable": True,
    },
    "alto_parana_represas": {
        "nombre": "Alto Paraná de represas (Posadas ➔ Itaipú)",
        "descripcion": (
            "Tramo embalsado y regulado por Yacyretá e Itaipú: no hay canal dragado "
            "con profundidad garantizada, así que estas estaciones se muestran como "
            "referencia hidrológica pero no definen calado."
        ),
        "profundidad_garantizada_pies": None,
        "navegable": False,
    },
}


# A que tramo pertenece cada estacion. Solo estan las que estan sobre el canal
# principal de navegacion: las escalas de riachos y canales secundarios del
# Delta (Ibicuy, Paranacito, Chaná Miní, Guazucito, Canal Nuevo) y las urbanas
# que no son del canal (Tigre, Dique Luján) quedan afuera a proposito, porque
# darles la profundidad del canal principal seria inventar un dato.
ESTACION_A_TRAMO = {
    # Océano / Río de la Plata / Delta / Paraná Inferior — 34 pies
    "BRAGA": "oceano_gran_rosario",
    "ATALAYA": "oceano_gran_rosario",
    "LA PLATA": "oceano_gran_rosario",
    "BUENOS AIRES": "oceano_gran_rosario",
    "OLIVOS": "oceano_gran_rosario",
    "SAN ISIDRO": "oceano_gran_rosario",
    "MARTIN GARCIA": "oceano_gran_rosario",
    "SAN FERNANDO": "oceano_gran_rosario",
    "ESCOBAR": "oceano_gran_rosario",
    "CAMPANA": "oceano_gran_rosario",
    "ZARATE": "oceano_gran_rosario",
    "BARADERO": "oceano_gran_rosario",
    "SAN PEDRO": "oceano_gran_rosario",
    "RAMALLO": "oceano_gran_rosario",
    "SAN NICOLAS": "oceano_gran_rosario",
    "VILLA CONSTITUCION": "oceano_gran_rosario",
    "ROSARIO": "oceano_gran_rosario",
    "SAN LORENZO": "oceano_gran_rosario",
    # Gran Rosario ➔ Santa Fe — 25 pies
    "DIAMANTE": "gran_rosario_santa_fe",
    "SANTA FE": "gran_rosario_santa_fe",
    "PARANA": "gran_rosario_santa_fe",
    # Paraná Medio — 10 pies
    "SANTA ELENA": "santa_fe_confluencia",
    "LA PAZ": "santa_fe_confluencia",
    "ESQUINA": "santa_fe_confluencia",
    "RECONQUISTA": "santa_fe_confluencia",
    "GOYA": "santa_fe_confluencia",
    "BELLA VISTA": "santa_fe_confluencia",
    "EMPEDRADO": "santa_fe_confluencia",
    "BARRANQUERAS": "santa_fe_confluencia",
    "CORRIENTES": "santa_fe_confluencia",
    # Río Paraguay (tramo argentino) — 10 pies
    "ISLA DEL CERRITO": "confluencia_asuncion",
    "LAS PALMAS": "confluencia_asuncion",
    "BERMEJO": "confluencia_asuncion",
    "BOUVIER": "confluencia_asuncion",
    "FORMOSA": "confluencia_asuncion",
    "PILCOMAYO": "confluencia_asuncion",
    # Alto Paraná navegable — 10 pies
    "PASO DE LA PATRIA": "alto_parana",
    "ITATI": "alto_parana",
    "ITA IBATE": "alto_parana",
    "ITUZAINGO": "alto_parana",
    "POSADAS": "alto_parana",
    # Alto Paraná de represas — sin profundidad garantizada
    "SANTA ANA": "alto_parana_represas",
    "PUERTO MANI": "alto_parana_represas",
    "LIBERTAD": "alto_parana_represas",
    "LIBERTADOR": "alto_parana_represas",
    "ELDORADO": "alto_parana_represas",
    "HERNANDARIAS": "alto_parana_represas",
    "REPRESA ITAIPU (BRASIL)": "alto_parana_represas",
    "GUAYRA (BRASIL)": "alto_parana_represas",
}


# Las estaciones estan aguas abajo del complejo Timbúes-San Lorenzo-Rosario
# (km ~460), hasta donde llegan fisicamente los buques oceanicos. Misma lista
# que ESTACIONES_APTAS_OCEANICOS en frontend/src/embarcaciones.js, que la usa
# para no ofrecer categorias oceanicas al cargar un activo; aca sirve para
# advertir si una ruta guardada manda un Panamax mas arriba de lo que puede ir.
ESTACIONES_APTAS_OCEANICOS = {
    "BUENOS AIRES", "LA PLATA", "TIGRE", "SAN FERNANDO", "SAN ISIDRO", "OLIVOS",
    "MARTIN GARCIA", "ATALAYA", "ESCOBAR", "CAMPANA", "ZARATE", "BARADERO",
    "SAN PEDRO", "RAMALLO", "SAN NICOLAS", "VILLA CONSTITUCION", "ROSARIO",
    "SAN LORENZO", "BRAGA",
}


# Lo que el motor de calculo necesita saber de cada categoria, que no se puede
# deducir de los campos de texto libre del activo. La ficha completa (eslora,
# DWT, etiqueta, etc.) vive en frontend/src/embarcaciones.js y se copia a
# activos cuando el usuario elige una categoria; aca solo estan las banderas.
CATEGORIAS = {
    "panamax": {"oceanico": True, "es_convoy": False},
    "handymax": {"oceanico": True, "es_convoy": False},
    "handy": {"oceanico": True, "es_convoy": False},
    "fluviomaritimo": {"oceanico": False, "es_convoy": False},
    "convoy_estandar": {"oceanico": False, "es_convoy": True},
    "convoy_grande": {"oceanico": False, "es_convoy": True, "barcazas_por_defecto": 16},
    "barcaza_chica": {"oceanico": False, "es_convoy": True},
    "arenera_draga": {"oceanico": False, "es_convoy": False},
    "remolcador": {"oceanico": False, "es_convoy": False},
}

# Barcaza tipo del convoy, para cuando la ficha del activo trae "N/A (se
# calcula por barcaza)" en ton_por_pie y DWT (caso convoy_grande): el total del
# convoy es esto multiplicado por la cantidad de barcazas de la ruta.
TON_POR_PIE_BARCAZA = 165.0
DWT_BARCAZA_T = 1625.0  # punto medio del rango 1.500-1.750 de la barcaza tipo

# Resguardo bajo quilla (under keel clearance) por defecto, en pies. Es lo que
# se descuenta del agua disponible para no ir raspando el fondo. Editable por
# ruta; estos son los valores de arranque, mas exigentes para el buque oceanico.
RESGUARDO_OCEANICO_PIES = 2.0
RESGUARDO_FLUVIAL_PIES = 1.0


# Rutas principales precargadas: el usuario aprieta un boton y se le arma la
# ruta con las estaciones intermedias en orden, en vez de cargarlas a mano.
# El orden de `estaciones` ES el trayecto (origen primero, destino ultimo).
PLANTILLAS = {
    "oceanico": {
        "nombre": "Corredor Oceánico (Up-River)",
        "boton": "Océano ➔ Gran Rosario",
        "descripcion": (
            "Del Atlántico por el Río de la Plata y el Paraná hasta el cordón del "
            "Gran Rosario. Es donde se define el calado de despacho: el buque entra "
            "vacío y busca salir con la máxima carga posible."
        ),
        "sentido": "ascendente",
        "carga_tipica": "Granos, aceites y harinas de exportación.",
        "estaciones": [
            "ATALAYA", "BUENOS AIRES", "MARTIN GARCIA", "SAN FERNANDO", "ESCOBAR",
            "CAMPANA", "ZARATE", "BARADERO", "SAN PEDRO", "RAMALLO", "SAN NICOLAS",
            "VILLA CONSTITUCION", "ROSARIO", "SAN LORENZO",
        ],
    },
    "barcazas": {
        "nombre": "Gran Ruta de las Barcazas (Norte a Sur)",
        "boton": "Pilcomayo ➔ Gran Rosario",
        "descripcion": (
            "Baja por el río Paraguay hasta la confluencia y sigue por el Paraná "
            "hasta las terminales del Gran Rosario. El tramo paraguayo (Corumbá, "
            "Asunción, Villeta, Pilar) todavía no tiene estaciones en el sistema, "
            "así que la ruta arranca en Pilcomayo."
        ),
        "sentido": "descendente",
        "carga_tipica": "Mineral de hierro, soja y combustibles de subida.",
        "estaciones": [
            "PILCOMAYO", "FORMOSA", "BERMEJO", "LAS PALMAS", "ISLA DEL CERRITO",
            "CORRIENTES", "BARRANQUERAS", "BELLA VISTA", "GOYA", "ESQUINA",
            "LA PAZ", "SANTA ELENA", "PARANA", "SANTA FE", "DIAMANTE",
            "SAN LORENZO", "ROSARIO",
        ],
    },
    "alto_parana": {
        "nombre": "Ruta del Alto Paraná (influencia de represas)",
        "boton": "Posadas ➔ Corrientes",
        "descripcion": (
            "Del área de Posadas/Encarnación bajando el Alto Paraná hasta "
            "Corrientes/Resistencia. Depende de los caudales que liberan Itaipú y "
            "Yacyretá, que el sistema ya tiene integrados."
        ),
        "sentido": "descendente",
        "carga_tipica": "Producción agrícola regional, madera y fertilizantes.",
        "estaciones": [
            "POSADAS", "ITUZAINGO", "ITA IBATE", "ITATI", "PASO DE LA PATRIA",
            "CORRIENTES", "BARRANQUERAS",
        ],
    },
    "cabotaje_norte": {
        "nombre": "Cabotaje Barranqueras ➔ Gran Rosario",
        "boton": "Barranqueras ➔ Gran Rosario",
        "descripcion": (
            "Conexión interna del Paraná Medio hacia el polo portuario. Necesita "
            "previsibilidad a 24-72 horas para coordinar la ventana de descarga."
        ),
        "sentido": "descendente",
        "carga_tipica": "Combustibles, arena, piedra y contenedores feeder.",
        "estaciones": [
            "BARRANQUERAS", "BELLA VISTA", "GOYA", "ESQUINA", "LA PAZ",
            "SANTA ELENA", "PARANA", "SANTA FE", "DIAMANTE", "SAN LORENZO", "ROSARIO",
        ],
    },
    "cabotaje_sur": {
        "nombre": "Cabotaje Santa Fe ➔ Buenos Aires",
        "boton": "Santa Fe ➔ Buenos Aires",
        "descripcion": (
            "Bajada hacia los puertos industriales de Zárate, Campana y Buenos Aires."
        ),
        "sentido": "descendente",
        "carga_tipica": "Combustibles, contenedores feeder y carga industrial.",
        "estaciones": [
            "SANTA FE", "DIAMANTE", "SAN LORENZO", "ROSARIO", "VILLA CONSTITUCION",
            "SAN NICOLAS", "RAMALLO", "SAN PEDRO", "BARADERO", "ZARATE", "CAMPANA",
            "ESCOBAR", "SAN FERNANDO", "BUENOS AIRES",
        ],
    },
}


def tramo_de_estacion(clave_estacion: str) -> tuple[str | None, dict | None]:
    """(id_tramo, datos_tramo) de una estacion ya normalizada, o (None, None)
    si esa estacion no esta mapeada a ningun tramo de la via navegable."""
    id_tramo = ESTACION_A_TRAMO.get(clave_estacion)
    return (id_tramo, TRAMOS[id_tramo]) if id_tramo else (None, None)


def plantillas_para_frontend() -> list[dict]:
    """Las plantillas como lista ordenada, para los botones de ruta rápida."""
    return [{"clave": clave, **datos} for clave, datos in PLANTILLAS.items()]
