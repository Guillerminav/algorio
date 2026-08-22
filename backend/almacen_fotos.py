"""Dónde viven las fotos de un comercio.

DONDE CONVIENE GUARDARLAS

El proyecto corre sobre tres servicios gratuitos y eso descarta la mitad de las
opciones antes de empezar:

- **El disco de Render no sirve.** Es efimero: se borra en cada deploy y en
  cada reinicio, que en el plan free pasa varias veces por dia.
- **Vercel es solo el frontend.** No tiene donde poner un archivo.
- **Neon (Postgres) da 0,5 GB** en el plan free. Hoy la base pesa 12 MB, asi
  que sobran ~488 MB: con fotos de ~250 KB entran unas 1.900. Alcanza y sobra
  para el volumen de este producto.

Asi que hay dos caminos razonables, y estan los dos implementados:

1. **Postgres** (por defecto, y funciona hoy sin crear ninguna cuenta). Las
   fotos van a `poi_fotos` como bytes y se sirven desde `/api/fotos/{id}`.
   Ventaja: cero servicios nuevos, cero claves, y entran en el backup de la
   base. Desventaja: las sirve Render, que en el plan free se duerme — aunque
   eso ya le pasa a toda la app, no solo a las fotos.

2. **Cloudinary** (si estan las variables de entorno). 25 GB gratis, que es
   cincuenta veces lo de Neon, y —lo que de verdad importa— las entrega desde
   un CDN, o sea que la foto se ve aunque Render este dormido. Ademas convierte
   a WebP y ajusta calidad sola (`f_auto,q_auto`), que sobre el rio con mala
   señal es la diferencia entre que cargue y que no.

Se eligio Cloudinary como el camino recomendado y no Supabase Storage (1 GB) ni
Cloudflare R2 (10 GB, sin egress) por el tamaño del plan free y porque es el
unico de los tres que hace las transformaciones solo. R2 seria mejor a escala
grande; a esta, la diferencia es tener que armar el redimensionado a mano.

COMO SE ELIGE

No hay que tocar codigo: si `CLOUDINARY_CLOUD_NAME` y
`CLOUDINARY_UPLOAD_PRESET` estan en el entorno, se usa Cloudinary; si no,
Postgres. Lo que se guarda en `pois.fotos` es una URL en los dos casos, asi que
el mapa, la ficha y la app no se enteran de la diferencia.

SOBRE EL TAMAÑO

La foto llega ya redimensionada desde el navegador (ver frontend/src/fotos.js).
Eso no es una optimizacion: una foto de celular son 4-8 MB y subir eso por la
señal de un muelle, contra un Render que puede estar despertando, no termina
nunca. El limite de aca es la red de contencion, no el mecanismo.
"""
import os
from typing import Optional

import httpx

from db import conexion, inicializar_db

# 2 MB. El navegador manda ~300 KB; esto es para que un cliente que no
# redimensione no pueda llenar la base de una.
MAX_BYTES = 2 * 1024 * 1024

# Cuantas fotos por comercio. No es una restriccion tecnica: una ficha con
# quince fotos no la mira nadie, y el nauta decide con dos o tres.
MAX_FOTOS = 8

TIPOS_ACEPTADOS = {"image/jpeg", "image/png", "image/webp"}

CLOUDINARY_CLOUD = os.environ.get("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_PRESET = os.environ.get("CLOUDINARY_UPLOAD_PRESET")


def usando_cloudinary() -> bool:
    return bool(CLOUDINARY_CLOUD and CLOUDINARY_PRESET)


def _a_cloudinary(contenido: bytes, mime: str) -> str:
    """Sube con un preset sin firmar y devuelve la URL del CDN.

    Sin firmar quiere decir que no hay ninguna clave secreta en el servidor ni
    en el navegador: el preset se configura del lado de Cloudinary con lo que
    se permite (carpeta, tamaño maximo, formatos). Es lo que hay que endurecer
    alla, no aca.

    Las transformaciones se piden en la URL de entrega y no al subir, para no
    perder el original: si mañana hace falta otro tamaño, se cambia la URL.
    """
    respuesta = httpx.post(
        f"https://api.cloudinary.com/v1_1/{CLOUDINARY_CLOUD}/image/upload",
        data={"upload_preset": CLOUDINARY_PRESET},
        files={"file": ("foto", contenido, mime)},
        timeout=30,
    )
    respuesta.raise_for_status()
    datos = respuesta.json()
    url = datos.get("secure_url")
    if not url:
        raise RuntimeError("Cloudinary no devolvió una URL.")

    # f_auto elige WebP/AVIF segun el navegador, q_auto baja la calidad hasta
    # donde no se nota y w_1600 acota el ancho. Sobre el rio, con señal mala,
    # esto es la diferencia entre que cargue y que no.
    return url.replace("/upload/", "/upload/f_auto,q_auto,w_1600/", 1)


def _a_postgres(usuario: str, poi_id: int, contenido: bytes, mime: str) -> str:
    inicializar_db()
    with conexion() as con:
        fila = con.execute(
            "INSERT INTO poi_fotos (poi_id, usuario, mime, datos) VALUES (%s, %s, %s, %s) "
            "RETURNING id",
            (poi_id, usuario, mime, contenido),
        ).fetchone()
    return f"/api/fotos/{fila['id']}"


def guardar(usuario: str, poi_id: int, contenido: bytes, mime: str) -> str:
    """Guarda la foto donde corresponda y devuelve la URL para `pois.fotos`."""
    if mime not in TIPOS_ACEPTADOS:
        raise ValueError("Solo aceptamos imágenes JPG, PNG o WebP.")
    if not contenido:
        raise ValueError("El archivo llegó vacío.")
    if len(contenido) > MAX_BYTES:
        raise ValueError(
            f"La imagen pesa {len(contenido) // 1024} KB y el máximo es "
            f"{MAX_BYTES // 1024} KB. Probá con una más chica."
        )

    if usando_cloudinary():
        try:
            return _a_cloudinary(contenido, mime)
        except (httpx.HTTPError, RuntimeError, ValueError):
            # Si Cloudinary no contesta se guarda en la base igual. Perder la
            # foto que alguien acaba de sacar porque un tercero esta caido
            # seria el peor final posible; la URL interna funciona igual.
            pass
    return _a_postgres(usuario, poi_id, contenido, mime)


def leer(foto_id: int) -> Optional[tuple[bytes, str]]:
    """Los bytes de una foto guardada en Postgres. Cloudinary no pasa por aca:
    esas URLs las sirve su CDN directo."""
    inicializar_db()
    with conexion() as con:
        fila = con.execute(
            "SELECT datos, mime FROM poi_fotos WHERE id = %s", (foto_id,)
        ).fetchone()
    return (bytes(fila["datos"]), fila["mime"]) if fila else None


def borrar_huerfanas(poi_id: int, urls_en_uso: list) -> None:
    """Borra de la base las fotos de ese POI que ya no figuran en la ficha.

    Sin esto, cada foto que el comerciante quita queda ocupando lugar para
    siempre: la lista de `pois.fotos` es la unica fuente de verdad de que se
    esta mostrando, y lo que no esta ahi no lo va a ver nadie nunca mas.
    """
    ids = []
    for url in urls_en_uso or []:
        if isinstance(url, str) and url.startswith("/api/fotos/"):
            resto = url.rsplit("/", 1)[-1]
            if resto.isdigit():
                ids.append(int(resto))

    inicializar_db()
    with conexion() as con:
        if ids:
            con.execute(
                "DELETE FROM poi_fotos WHERE poi_id = %s AND id <> ALL(%s)", (poi_id, ids)
            )
        else:
            con.execute("DELETE FROM poi_fotos WHERE poi_id = %s", (poi_id,))
