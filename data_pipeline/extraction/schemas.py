"""Esquemas Pydantic usados para pedirle a Gemini que estructure cada boletin.

Un esquema por fuente. El notebook original tenia dos versiones del esquema de
Yacyreta (BoletinYacyreta y ResumenEjecutivoYacyreta); aca se conserva solo la
segunda, que es la que realmente coincide con el "Resumen Ejecutivo" que publica
la EBY y la que funciono en la prueba real.
"""
from typing import Optional

from pydantic import BaseModel


class ResumenEjecutivoYacyreta(BaseModel):
    fecha_boletin: str
    numero_resumen: Optional[str] = None
    nivel_embalse_ayer_msnm: Optional[float] = None
    nivel_embalse_hoy_msnm: Optional[float] = None
    caudal_afluente_hoy_m3s: Optional[float] = None
    caudal_afluente_manana_m3s: Optional[float] = None
    vertedero_brazo_principal: Optional[str] = None  # "Cerrado" o caudal en m3/s
    vertedero_ana_cua_m3s: Optional[float] = None
    altura_ayolas_m: Optional[float] = None
    altura_ituzaingo_m: Optional[float] = None
    indice_nino34_c: Optional[float] = None  # viene mencionado en el propio boletin
    estado_enso: Optional[str] = None  # ej: "El Nino en curso, intensidad fuerte a muy fuerte"


class BoletinItaipu(BaseModel):
    fecha_boletin: str
    nivel_jusante_m: Optional[float] = None
    vazao_vertida_m3s: Optional[float] = None
    vazao_turbinada_m3s: Optional[float] = None
    situacao_vertedouro: Optional[str] = None


class EstacionINA(BaseModel):
    estacion: str
    rio: Optional[str] = None
    nivel_actual_m: Optional[float] = None
    tendencia: Optional[str] = None  # ej: "creciendo", "bajando", "estacionario"
    estado: Optional[str] = None  # ej: "normal", "alerta", "evacuacion" (color del cuadro)


class CuadroINA(BaseModel):
    fecha_boletin: str
    estaciones: list[EstacionINA]
