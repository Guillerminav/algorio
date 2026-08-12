"""Convierte la tipografia de marca (Glock Grotesque, .otf) al formato que
sabe embeber jsPDF y la deja lista para importar desde el frontend.

Por que hace falta: el informe de ruta en PDF lleva el logotipo "AlgoRio" en
la tipografia de la marca, la misma de la barra lateral. jsPDF solo embebe
TrueType, y el archivo original es OpenType con contornos CFF, asi que hay que
convertir las curvas cubicas a cuadraticas (cu2qu) y armar una tabla `glyf`.

Se corre a mano cuando cambia el archivo de la fuente, no en cada build:
    python -m scripts.generar_fuente_marca
y deja el resultado en frontend/src/fuenteMarca.js (versionado).
"""
import base64
import io
import json
from pathlib import Path

from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.subset import Subsetter
from fontTools.ttLib import TTFont, newTable

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / "frontend" / "public" / "fuentes" / "glockgrotesque-medium.otf"
DESTINO = RAIZ / "frontend" / "src" / "fuenteMarca.js"

# Solo lo que puede aparecer en un logotipo: letras, digitos y puntuacion
# basica. La fuente completa trae ademas cirilico y flechas que en el PDF no
# se usan y solo pesarian. Ojo: no tiene vocales acentuadas (ver abajo).
CARACTERES = (
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "abcdefghijklmnopqrstuvwxyz"
    "0123456789"
    " .,:;!?-()[]'\"@/"
)

TOLERANCIA_CURVA = 0.001  # error maximo al aproximar cada curva, en em


def a_truetype(fuente: TTFont) -> TTFont:
    """Reemplaza los contornos CFF por una tabla `glyf` equivalente."""
    conjunto = fuente.getGlyphSet()
    glifos = {}
    for nombre in fuente.getGlyphOrder():
        lapiz = TTGlyphPen(glifos)
        conjunto[nombre].draw(Cu2QuPen(lapiz, TOLERANCIA_CURVA))
        glifos[nombre] = lapiz.glyph()

    fuente["glyf"] = newTable("glyf")
    fuente["glyf"].glyphOrder = fuente.getGlyphOrder()
    fuente["glyf"].glyphs = glifos

    fuente["loca"] = newTable("loca")
    fuente["maxp"].numGlyphs = len(glifos)
    # jsPDF lee estos campos del head/maxp para calcular metricas; se dejan en
    # valores validos y el compilador de fontTools recalcula el resto.
    fuente["head"].indexToLocFormat = 0
    fuente["head"].glyphDataFormat = 0

    for tabla in ("CFF ", "VORG", "DSIG", "GPOS", "GSUB", "GDEF", "vhea", "vmtx"):
        if tabla in fuente:
            del fuente[tabla]

    # Sin esto el archivo queda firmado como "OTTO" (OpenType con CFF) aunque
    # adentro ya tenga contornos TrueType, y cualquier lector estricto lo
    # rechaza buscando una tabla CFF que ya no esta.
    fuente.sfntVersion = "\000\001\000\000"
    return fuente


def main() -> None:
    fuente = a_truetype(TTFont(str(ORIGEN)))

    subsetter = Subsetter()
    subsetter.populate(text=CARACTERES)
    subsetter.subset(fuente)

    salida = RAIZ / "scripts" / "_glock.ttf"
    fuente.save(str(salida))
    datos = salida.read_bytes()
    salida.unlink()

    # Que caracteres quedaron realmente con glifo: la fuente de marca no trae
    # vocales acentuadas, asi que el PDF tiene que saber cuales dibujar con
    # ella y cuales dejarle a la tipografia de respaldo (igual que hace el
    # navegador con font-family en la barra lateral).
    cmap_final = TTFont(io.BytesIO(datos)).getBestCmap()
    soportados = "".join(sorted(c for c in CARACTERES if ord(c) in cmap_final))

    # json.dumps y no repr(): la lista de caracteres soportados incluye la
    # comilla doble, y armar el literal a mano la dejaba sin escapar.
    DESTINO.write_text(
        "// GENERADO por scripts/generar_fuente_marca.py -- no editar a mano.\n"
        "//\n"
        "// Glock Grotesque Medium (la tipografia de marca, la misma que usa la\n"
        "// barra lateral) convertida de OTF/CFF a TrueType y subseteada, para que\n"
        "// jsPDF pueda embeberla en el informe de ruta.\n"
        "//\n"
        "// CARACTERES_SOPORTADOS no incluye vocales acentuadas porque la fuente\n"
        "// original no las trae. Por eso el wordmark se escribe \"AlgoRio\" sin\n"
        "// tilde, igual que en la app, la landing y los mails.\n"
        'export const NOMBRE_FUENTE_MARCA = "GlockGrotesque";\n'
        'export const ARCHIVO_FUENTE_MARCA = "GlockGrotesque-Medium.ttf";\n'
        f"export const CARACTERES_SOPORTADOS = {json.dumps(soportados)};\n"
        f'export const FUENTE_MARCA_BASE64 =\n  "{base64.b64encode(datos).decode()}";\n',
        encoding="utf-8",
    )
    print(f"{DESTINO.relative_to(RAIZ)}: {len(datos)} bytes de TTF "
          f"-> {DESTINO.stat().st_size} bytes de modulo")
    print("soportados:", soportados)


if __name__ == "__main__":
    main()
