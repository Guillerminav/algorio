"""Deja la tipografia del logo lista para la app movil.

    python -m scripts.preparar_tipografia_movil

Se corre una sola vez, o cuando cambie la fuente del wordmark.

QUE COPIA Y QUE NO:

Solo el wordmark "AlgoRio" (Glock Grotesque). El texto comun de la app usa la
tipografia del sistema —San Francisco en iPhone, Roboto en Android— y no hay
nada que empaquetar para eso: es una decision deliberada, ver el comentario
largo en app_movil/src/Texto.jsx.

Se deja igual el codigo que convierte woff2 a TTF, apagado detras de
`INCLUIR_TEXTO`, porque el dia que se quiera volver a la tipografia de marca en
la app hace falta: React Native no lee woff2 (el cargador de iOS y Android solo
entiende TTF y OTF), asi que hay que revertir la conversion desde los woff2 de
frontend/public/fuentes/. Es sin perdida —woff2 es el mismo contenido con otro
envoltorio— y evita guardar dos copias de la misma fuente que se puedan
desincronizar.

La descompresion la hace fontTools con brotli; las dos ya son dependencias del
proyecto (ver requirements.txt y scripts/preparar_tipografia.py).
"""
import shutil
from pathlib import Path

from fontTools.ttLib import TTFont

# La app usa la fuente del sistema para el texto comun. Poner en True si algun
# dia se vuelve a Host Grotesk (hay que reactivar tambien FUENTES en
# app_movil/src/tema.js y src/Texto.jsx).
INCLUIR_TEXTO = False

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / "frontend" / "public" / "fuentes"
DESTINO = RAIZ / "app_movil" / "assets" / "fuentes"


def preparar() -> None:
    if not ORIGEN.exists():
        raise SystemExit(f"No existe {ORIGEN}. Corre antes scripts/preparar_tipografia.py.")

    DESTINO.mkdir(parents=True, exist_ok=True)

    if INCLUIR_TEXTO:
        woff2 = sorted(ORIGEN.glob("hostgrotesk-*.woff2"))
        if not woff2:
            raise SystemExit(f"No hay hostgrotesk-*.woff2 en {ORIGEN}.")

        for ruta in woff2:
            fuente = TTFont(str(ruta))
            # flavor None = TTF/OTF plano, sin el envoltorio woff2.
            fuente.flavor = None
            salida = DESTINO / f"{ruta.stem}.ttf"
            fuente.save(str(salida))
            print(
                f"  {ruta.name:26} {ruta.stat().st_size // 1024:3} KB "
                f"-> {salida.name:25} {salida.stat().st_size // 1024:3} KB"
            )
    else:
        print("  (el texto comun usa la fuente del sistema; no se copia nada para eso)")

    # El wordmark ya es OTF, que React Native lee: se copia tal cual.
    glock = ORIGEN / "glockgrotesque-medium.otf"
    if glock.exists():
        shutil.copy2(glock, DESTINO / glock.name)
        print(f"  {glock.name} copiada tal cual (OTF ya sirve)")
    else:
        print(f"  OJO: no encontre {glock.name}; el wordmark va a caer a Host Grotesk.")

    # La OFL exige que la licencia viaje con la fuente cuando se redistribuye,
    # y meterla en el binario de una app es redistribuirla.
    licencia = ORIGEN / "OFL.txt"
    if licencia.exists():
        shutil.copy2(licencia, DESTINO / "OFL.txt")
        print("  OFL.txt copiada junto a las fuentes")


if __name__ == "__main__":
    preparar()
