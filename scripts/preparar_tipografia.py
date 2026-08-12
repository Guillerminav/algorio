"""Convierte las tipografias de Host Grotesk a woff2 y las deja en su lugar.

    python -m scripts.preparar_tipografia <carpeta-con-los-ttf>

Se corre una sola vez, cuando se descarga o se actualiza la familia. Copia el
resultado tanto al sistema como a la landing, que comparten identidad visual.

POR QUE ESTE SCRIPT EXISTE, Y NO UN COPIAR-Y-PEGAR:

En la descarga original de Google Fonts los nombres de archivo NO se
corresponden con lo que cada archivo contiene. Por ejemplo,
"HostGrotesk-SemiBold.ttf" es en realidad la ExtraBold, y
"HostGrotesk-LightItalic.ttf" es la Bold recta. Copiarlos guiandose por el
nombre deja la pagina con los pesos cruzados y sin ninguna pista de por que.

Asi que el peso y el estilo se leen de adentro del archivo (nameID 17 del
name table, que es el estilo tipografico real) y se ignora el nombre.
"""
import shutil
import sys
from pathlib import Path

from fontTools.ttLib import TTFont

RAIZ = Path(__file__).resolve().parent.parent
DESTINOS = [
    RAIZ / "frontend" / "public" / "fuentes",
    RAIZ.parent / "landing_algorio" / "public" / "fuentes",
]

# Los pesos que el diseño usa (ver los font-weight de index.css y estilos.css).
# Las italicas no se incluyen: no hay un solo font-style:italic en el proyecto,
# y sumarian medio megabyte que nadie descarga para nada.
PESOS = {
    "Regular": 400,
    "Medium": 500,
    "SemiBold": 600,
    "Bold": 700,
    "ExtraBold": 800,
}


def _estilo_real(ruta: Path) -> tuple[str, bool]:
    """(estilo, es_italica) leidos de adentro del archivo."""
    fuente = TTFont(str(ruta))
    estilo = fuente["name"].getDebugName(17) or fuente["name"].getDebugName(2) or ""
    return estilo.strip(), fuente["post"].italicAngle != 0


def preparar(origen: Path) -> None:
    archivos = sorted(origen.glob("HostGrotesk-*.ttf"))
    if not archivos:
        raise SystemExit(f"No hay archivos HostGrotesk-*.ttf en {origen}")

    for destino in DESTINOS:
        destino.mkdir(parents=True, exist_ok=True)

    encontrados = {}
    for ruta in archivos:
        estilo, italica = _estilo_real(ruta)
        if italica or estilo not in PESOS:
            continue
        if estilo in encontrados:
            continue
        encontrados[estilo] = ruta

    faltan = sorted(set(PESOS) - set(encontrados))
    if faltan:
        raise SystemExit(
            f"Faltan pesos rectos en {origen}: {faltan}. "
            "Reviso el contenido de cada archivo, no su nombre."
        )

    for estilo, ruta in sorted(encontrados.items(), key=lambda kv: PESOS[kv[0]]):
        peso = PESOS[estilo]
        fuente = TTFont(str(ruta))
        fuente.flavor = "woff2"
        salida = DESTINOS[0] / f"hostgrotesk-{peso}.woff2"
        fuente.save(str(salida))
        for otro in DESTINOS[1:]:
            shutil.copy2(salida, otro / salida.name)
        print(
            f"  {estilo:10} (peso {peso}) <- {ruta.name:42} "
            f"{ruta.stat().st_size // 1024} KB -> {salida.stat().st_size // 1024} KB"
        )

    # La OFL exige que la licencia viaje con la fuente cuando se redistribuye,
    # y publicarla en el sitio es redistribuirla.
    licencia = origen / "OFL.txt"
    if licencia.exists():
        for destino in DESTINOS:
            shutil.copy2(licencia, destino / "OFL.txt")
        print("  OFL.txt copiada junto a las fuentes")
    else:
        print(f"  OJO: no encontre OFL.txt en {origen}; hay que copiarla a mano.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(f"Uso: python -m scripts.preparar_tipografia <carpeta-con-los-ttf>")
    preparar(Path(sys.argv[1]))
