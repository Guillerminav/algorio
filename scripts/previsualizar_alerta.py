"""Previsualiza (y opcionalmente manda) el mail de alerta de "Mi flota".

Sirve para dos cosas distintas:

1. Ver como queda el diseño, sin tocar la base ni mandar nada:

       python -m scripts.previsualizar_alerta

   Escribe un HTML por cada severidad y te dice donde quedaron. Se abren en
   el navegador. Es lo que conviene usar mientras se retoca el diseño: no
   depende de Resend, ni de que haya un activo cruzando su umbral, ni de
   esperar a que baje el rio.

2. Probar el envio de verdad, punta a punta (Resend, dominio verificado,
   remitente, adjunto del logo):

       python -m scripts.previsualizar_alerta --enviar vos@tumail.com

   Necesita RESEND_API_KEY en el entorno. Manda con los mismos datos de
   ejemplo, asi que no toca activos reales ni escribe en alertas_notificadas.

En la previsualizacion el logo va como data: URI porque el navegador lo
entiende; en el mail real va como adjunto inline ("cid:"), que es lo que
entienden los clientes de correo. Es la unica diferencia entre las dos.
"""
import argparse
import base64
import sys
import tempfile
import webbrowser
from pathlib import Path

from backend import notificaciones

# Datos de ejemplo, uno por severidad. Son plausibles a proposito (estaciones
# y niveles reales del Parana) para que al mirar la previsualizacion se note
# si un numero quedo mal formateado o un texto no entra.
EJEMPLOS = {
    "minimo": {
        "severidad": "minimo",
        "nombre": "Buque Paraná Sur",
        "tipo": "embarcacion",
        "estacion_referencia": "Rosario",
        "rio": "Paraná",
        "nivel_actual_m": 1.42,
        "umbral_minimo_efectivo_m": 1.80,
        "umbral_maximo_efectivo_m": 4.50,
        "umbral_maximo_m": None,
        "fecha_boletin": "2026-08-10",
    },
    "maximo": {
        "severidad": "maximo",
        "nombre": "Muelle Barranqueras",
        "tipo": "muelle",
        "estacion_referencia": "Barranqueras",
        "rio": "Paraná",
        "nivel_actual_m": 5.63,
        "umbral_minimo_efectivo_m": 1.20,
        "umbral_maximo_efectivo_m": 5.30,
        "umbral_maximo_m": 5.30,
        "fecha_boletin": "2026-08-10",
    },
}


def _imprimir(texto: str) -> None:
    """print() a prueba de consola: el asunto lleva ▼/▲ y la consola de
    Windows usa cp1252, que no los tiene y corta el script con
    UnicodeEncodeError. Los caracteres que no entren se reemplazan; el mail
    de verdad sale igual, porque va por HTTP en UTF-8."""
    codificacion = sys.stdout.encoding or "utf-8"
    print(texto.encode(codificacion, errors="replace").decode(codificacion))


def _logo_data_uri() -> str | None:
    """El logo embebido, para que se vea al abrir el HTML en el navegador."""
    if not notificaciones.ARCHIVO_LOGO.exists():
        print(
            f"Aviso: falta {notificaciones.ARCHIVO_LOGO}. El encabezado va a caer al "
            "wordmark de texto. Genera el PNG con: python -m scripts.generar_logo_mail",
            file=sys.stderr,
        )
        return None
    datos = base64.b64encode(notificaciones.ARCHIVO_LOGO.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{datos}"


def previsualizar(directorio: Path, abrir: bool) -> list[Path]:
    logo = _logo_data_uri()
    directorio.mkdir(parents=True, exist_ok=True)
    escritos = []

    for severidad, activo in EJEMPLOS.items():
        destino = directorio / f"alerta-{severidad}.html"
        destino.write_text(notificaciones.construir_html(activo, logo_src=logo), encoding="utf-8")
        escritos.append(destino)
        _imprimir(f"[{severidad}] {destino}")
        _imprimir(f"          asunto: {notificaciones._asunto(activo)}")
        if abrir:
            webbrowser.open(destino.as_uri())

    return escritos


def enviar_prueba(destinatario: str) -> None:
    for severidad, activo in EJEMPLOS.items():
        try:
            notificaciones._enviar(destinatario, activo)
            print(f"[{severidad}] enviado a {destinatario}.")
        except Exception as e:
            print(f"[{severidad}] fallo: {e}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--enviar",
        metavar="EMAIL",
        help="manda los mails de ejemplo a esa direccion (necesita RESEND_API_KEY)",
    )
    parser.add_argument(
        "--salida",
        type=Path,
        default=Path(tempfile.gettempdir()) / "algorio-previsualizacion",
        help="carpeta donde escribir los HTML (por defecto, una temporal)",
    )
    parser.add_argument(
        "--no-abrir",
        action="store_true",
        help="no abrir los HTML en el navegador automaticamente",
    )
    args = parser.parse_args()

    if args.enviar:
        enviar_prueba(args.enviar)
    else:
        previsualizar(args.salida, abrir=not args.no_abrir)


if __name__ == "__main__":
    main()
