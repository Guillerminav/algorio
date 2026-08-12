"""Genera el wordmark de AlgoRio como PNG, para el encabezado de los mails.

    python -m scripts.generar_logo_mail

Escribe backend/logo_mail.png, que backend/notificaciones.py adjunta al mail
como imagen inline. Se genera una vez y se commitea, igual que
frontend/src/fuenteMarca.js: no hace falta correrlo en cada deploy.

Por que una imagen y no texto con la tipografia de marca: los clientes de
correo ignoran @font-face (Gmail lo borra directamente), asi que un <span>
con la tipografia de marca terminaria renderizado en Helvetica. La unica forma de
que el wordmark se vea como en el producto es mandarlo rasterizado.

El fondo va con el azul de marca pegado (no transparente) porque Outlook
compone mal los PNG con alpha sobre fondos de color: como el encabezado del
mail es de ese mismo azul, la imagen se funde sin costura.

El wordmark se escribe "AlgoRio", sin tilde: Glock Grotesque trae 187 glifos y
ninguna vocal acentuada, asi que con la tilde la "í" salia de otra tipografia y
quedaba una letra prestada en el medio del logo. Es lo mismo que hacen la barra
lateral, la landing y el informe PDF.

OJO: el logo va en Glock Grotesque, no en Host Grotesk. Host Grotesk es la
tipografia del resto de la pagina; el logo mantiene la suya.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
FUENTE_MARCA = RAIZ / "frontend" / "public" / "fuentes" / "glockgrotesque-medium.otf"
SALIDA = RAIZ / "backend" / "logo_mail.png"

# El azul de marca (--marca en frontend/src/index.css) y el blanco del
# wordmark, los mismos que usa .marca-texto en la barra lateral.
FONDO = (11, 50, 82)
TINTA = (255, 255, 255)

# Se rasteriza a 3x y se muestra a 1/3 del tamaño (ver ESCALA en
# notificaciones.py): asi no se ve borroso en pantallas retina.
ESCALA = 3
TAMANO_FUENTE = 22 * ESCALA
MARGEN_X = 2 * ESCALA
MARGEN_Y = 6 * ESCALA

TEXTO = "AlgoRio"


def generar() -> Path:
    if not FUENTE_MARCA.exists():
        raise SystemExit(f"Falta la tipografia de marca en {FUENTE_MARCA}")

    fuente = ImageFont.truetype(str(FUENTE_MARCA), TAMANO_FUENTE)

    # Ningun caracter del wordmark puede faltar en la tipografia: si faltara,
    # PIL lo dibuja como .notdef (un rectangulo vacio) sin avisar, y el logo
    # saldria roto en todos los mails. Mejor cortar la generacion aca.
    faltantes = [c for c in TEXTO if fuente.getmask(c).getbbox() is None and c != " "]
    if faltantes:
        raise SystemExit(
            f"La tipografia no tiene estos caracteres de {TEXTO!r}: {faltantes}. "
            "Cambia TEXTO o usa un archivo de fuente que los incluya."
        )

    # Se dibuja primero sobre un lienzo holgado y despues se recorta a la
    # tinta real. Usar las metricas de la fuente para el alto deja un colchon
    # muerto abajo (el hueco reservado para descendentes que "AlgoRio" casi no
    # usa) y el logo queda descentrado en el encabezado del mail.
    ascenso, descenso = fuente.getmetrics()
    ancho_texto = fuente.getlength(TEXTO)
    holgura = TAMANO_FUENTE

    borrador = Image.new("L", (int(ancho_texto) + holgura * 2, ascenso + descenso + holgura * 2), 0)
    dibujo = ImageDraw.Draw(borrador)
    # anchor="ls" = left/baseline.
    dibujo.text((holgura, holgura + ascenso), TEXTO, font=fuente, fill=255, anchor="ls")

    caja = borrador.getbbox()
    if caja is None:
        raise SystemExit("El wordmark salio vacio: revisa que la tipografia cargue bien.")

    tinta = borrador.crop(caja)
    ancho = tinta.width + MARGEN_X * 2
    alto = tinta.height + MARGEN_Y * 2

    lienzo = Image.new("RGB", (ancho, alto), FONDO)
    # La tinta se pega como mascara: el color sale plano de TINTA y los bordes
    # antialiaseados se mezclan contra el azul, sin halo gris.
    lienzo.paste(TINTA, (MARGEN_X, MARGEN_Y), tinta)

    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    lienzo.save(SALIDA, "PNG", optimize=True)
    print(f"Escrito {SALIDA} ({ancho}x{alto} px).")
    # notificaciones.py necesita el tamaño de despliegue en el <img>: Outlook
    # no calcula el alto solo y sin los dos atributos deforma la imagen. Si
    # se regenera el logo con otro TAMANO_FUENTE, hay que copiar estos dos
    # numeros a LOGO_ANCHO / LOGO_ALTO alla.
    print(f"Copiar en backend/notificaciones.py -> LOGO_ANCHO = {ancho // ESCALA}, "
          f"LOGO_ALTO = {alto // ESCALA}")
    return SALIDA


if __name__ == "__main__":
    generar()
