"""Coordenadas aproximadas (lat, lon) de las estaciones de INA/Prefectura Naval,
para poder ubicarlas en el mapa interactivo (backend/datos.py: mapa_estaciones()).

Ninguna de las dos fuentes publica lat/lon, asi que esta es una tabla armada a
mano en base a la ubicacion geografica conocida de cada localidad/puerto/represa
(no una carta nautica oficial). Una estacion que no este aca simplemente no
aparece en el mapa (ver mapa_estaciones() en datos.py), no rompe nada.

>>> PENDIENTE: reemplazar/completar con la investigacion geografica completa
(en curso) de las 97 estaciones. Este es un subconjunto inicial de las mas
conocidas, solo para poder probar el endpoint de punta a punta mientras tanto.
"""

COORDENADAS_ESTACIONES = {
    "BUENOS AIRES": (-34.6037, -58.3816),
    "LA PLATA": (-34.9214, -57.9544),
    "TIGRE": (-34.4260, -58.5800),
    "ZARATE": (-34.0983, -59.0264),
    "SAN NICOLAS": (-33.3333, -60.2167),
    "VILLA CONSTITUCION": (-33.2333, -60.3333),
    "Rosario": (-32.9468, -60.6393),
    "Santa Fe": (-31.6333, -60.7000),
    "Corrientes": (-27.4806, -58.8341),
    "Barranqueras": (-27.4864, -58.9317),
    "POSADAS": (-27.3671, -55.8961),
    "Concordia": (-31.3928, -58.0209),
    "GUALEGUAYCHU": (-33.0094, -58.5172),
    "Formosa": (-26.1849, -58.1731),
    "CONFLUENCIA": (-25.6003, -54.5854),
    "Iguazú": (-25.5951, -54.5734),
    "ITAIPÚ": (-25.4084, -54.5896),
}
