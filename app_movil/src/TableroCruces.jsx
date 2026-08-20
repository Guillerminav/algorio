import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  aHora,
  aMinutos,
  estadoCruce,
  estadoDeSalida,
  faltanEnTexto,
  frecuenciaEnTexto,
  minutosAhoraAR,
  precioEnTexto,
  proximaSalida,
  salidasDe,
} from "./tablero.js";
import { Texto as Text } from "./Texto.jsx";
import { COLORES, VIDRIO } from "./tema.js";

// Cada cuánto se vuelve a mirar el reloj. Medio minuto: el dato que cambia es
// "en 12 min", que se lee con esa precisión. Cada segundo sería un render por
// segundo en la única pantalla que alguien deja abierta mientras espera.
const MS_REFRESCO = 30_000;

/** Minuto del día en Argentina, refrescado solo. */
export function useMinutoAR() {
  const [minuto, setMinuto] = useState(() => minutosAhoraAR());
  useEffect(() => {
    const id = setInterval(() => setMinuto(minutosAhoraAR()), MS_REFRESCO);
    return () => clearInterval(id);
  }, []);
  return minuto;
}

function Dato({ etiqueta, valor }) {
  if (!valor) return null;
  return (
    <View style={estilos.dato}>
      <Text style={estilos.datoEtiqueta}>{etiqueta}</Text>
      <Text style={estilos.datoValor}>{valor}</Text>
    </View>
  );
}

/**
 * Todas las salidas del dia, cada una con lo suyo.
 *
 * Es la parte que hace que esto sea un tablero de aeropuerto y no un cartel de
 * horarios: ahi la demora es de un vuelo, no de la aerolinea. Una salida que
 * el lanchero marco aparte lleva su etiqueta; las que heredan el estado del
 * recorrido no repiten nada, porque el chip de arriba ya lo dijo.
 */
function Salidas({ cruce }) {
  const salidas = salidasDe(cruce);
  if (salidas.length === 0) return null;

  return (
    <View style={estilos.salidas}>
      {salidas.map((salida) => {
        const estado = estadoDeSalida(cruce, salida);
        const demora = estado.clave === "demorado" ? (estado.demora_min ?? 0) : 0;
        const corrida = demora > 0 ? aHora(aMinutos(salida.hora) + demora) : null;
        const tachada = corrida !== null || estado.clave === "cancelado";

        return (
          <View
            key={salida.hora}
            style={[
              estilos.salida,
              estado.propio && { borderColor: estado.color, backgroundColor: "rgba(255,255,255,0.13)" },
            ]}
          >
            <Text style={tachada ? estilos.salidaVieja : estilos.salidaHora}>{salida.hora}</Text>
            {corrida ? <Text style={estilos.salidaHora}>{corrida}</Text> : null}
            {/* Solo si la marca es de esta salida: repetir el estado del
                recorrido en las quince filas lo convertiria en ruido. */}
            {estado.propio && estado.alterado ? (
              <Text style={[estilos.salidaEstado, { color: estado.color }]}>
                {estado.etiqueta.toUpperCase()}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function Fila({ cruce, ahoraMin, ultima }) {
  const estado = estadoCruce(cruce.estado);
  // Devuelve null cuando ninguna salida sale hoy —porque el recorrido esta
  // cancelado, o porque lo estan todas una por una—, asi que no hace falta
  // preguntarlo aparte.
  const salida = proximaSalida(cruce, ahoraMin);
  const noSale = salida === null;

  return (
    // Un cruce que hoy no sale se apaga entero: la información sigue estando
    // pero ya no sirve para planificar nada, y bajarle el contraste la saca
    // del camino de la que sí.
    <View style={[estilos.fila, !ultima && estilos.filaConBorde, noSale && estilos.filaApagada]}>
      <View style={estilos.filaCabecera}>
        <View style={estilos.destino}>
          <Text style={estilos.destinoNombre}>{cruce.destino}</Text>
          {cruce.origen ? <Text style={estilos.destinoOrigen}>desde {cruce.origen}</Text> : null}
        </View>
        <View style={[estilos.chipEstado, { backgroundColor: estado.color }]}>
          <Text style={estilos.chipEstadoTexto}>
            {estado.etiqueta.toUpperCase()}
            {cruce.estado === "demorado" && cruce.demora_min ? ` ${cruce.demora_min}′` : ""}
          </Text>
        </View>
      </View>

      <View style={estilos.datos}>
        <View style={estilos.dato}>
          <Text style={estilos.datoEtiqueta}>PRÓXIMA</Text>
          {salida ? (
            <View style={estilos.horas}>
              {/* La hora de cartel tachada y al lado la estimada: así se lee
                  que la salida se corrió sin tener que restar nada. */}
              <Text style={salida.estimada ? estilos.horaVieja : estilos.hora}>{salida.hora}</Text>
              {salida.estimada ? <Text style={estilos.hora}>{salida.estimada}</Text> : null}
              <Text style={estilos.falta}>
                {salida.manana ? "mañana" : faltanEnTexto(salida.faltan)}
              </Text>
            </View>
          ) : (
            <Text style={[estilos.hora, estilos.horaNula]}>—</Text>
          )}
        </View>

        <Dato etiqueta="FRECUENCIA" valor={frecuenciaEnTexto(cruce.frecuencia_min)} />
        <Dato etiqueta="PRECIO" valor={precioEnTexto(cruce.precio)} />
        <Dato etiqueta="ÚLT. REGRESO" valor={cruce.ultimo_regreso} />
        <Dato etiqueta="DURACIÓN" valor={cruce.duracion_min ? `${cruce.duracion_min} min` : null} />
      </View>

      {cruce.nota ? (
        <View style={[estilos.nota, { borderLeftColor: estado.color }]}>
          <Text style={estilos.notaTexto}>{cruce.nota}</Text>
        </View>
      ) : null}

      <Salidas cruce={cruce} />
    </View>
  );
}

/**
 * El tablero de cruces, como el de salidas de un aeropuerto.
 *
 * Contesta de un vistazo las cuatro preguntas de alguien parado en el muelle:
 * a qué hora sale la próxima, cada cuánto hay, cuánto cuesta y hasta qué hora
 * puede volver. Va oscuro y con horas grandes porque es el único bloque de la
 * ficha que se mira de reojo, con sol y decidiendo si correr o no.
 *
 * El estado lo mueve el lanchero desde su panel y se publica en el acto, sin
 * moderación (ver backend/tablero.py).
 */
export default function TableroCruces({ cruces }) {
  const ahoraMin = useMinutoAR();
  if (!cruces?.length) return null;

  return (
    <View style={estilos.tablero}>
      <View style={estilos.cabecera}>
        <Text style={estilos.cabeceraTitulo}>CRUCES</Text>
        <Text style={estilos.reloj}>{aHora(ahoraMin)}</Text>
      </View>

      {cruces.map((cruce, indice) => (
        <Fila
          key={cruce.id ?? indice}
          cruce={cruce}
          ahoraMin={ahoraMin}
          ultima={indice === cruces.length - 1}
        />
      ))}

      {/* Quién firma esto. Un tablero sin firma se lee como dato oficial; este
          lo carga el lanchero, y saberlo cambia cuánto se le confía. */}
      <Text style={estilos.pie}>
        Lo actualiza el lanchero. Los estados vuelven solos a “a horario” al día siguiente.
      </Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  tablero: { borderRadius: 14, backgroundColor: COLORES.marca, overflow: "hidden" },

  cabecera: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 9,
    borderBottomWidth: 1,
    borderBottomColor: VIDRIO.separador,
  },
  cabeceraTitulo: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: COLORES.marcaTextoSuave,
  },
  // La hora es la de Argentina y no la del teléfono (ver src/tablero.js): sin
  // ella, un "en 12 min" no tiene contra qué contrastarse.
  reloj: { fontSize: 15, fontWeight: "700", color: COLORES.acentoClaro, letterSpacing: 0.5 },

  fila: { paddingHorizontal: 14, paddingVertical: 12 },
  filaConBorde: { borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.09)" },
  filaApagada: { opacity: 0.62 },

  filaCabecera: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  destino: { flex: 1 },
  destinoNombre: { fontSize: 16, fontWeight: "700", color: "#fff" },
  destinoOrigen: { fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 1 },

  chipEstado: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  chipEstadoTexto: { fontSize: 10, fontWeight: "800", color: "#fff", letterSpacing: 0.7 },

  datos: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 10 },
  dato: { gap: 1 },
  datoEtiqueta: {
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 1,
    color: "rgba(255,255,255,0.5)",
  },
  datoValor: { fontSize: 14.5, fontWeight: "600", color: "#fff" },

  horas: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  hora: { fontSize: 17, fontWeight: "800", color: "#fff" },
  horaVieja: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255,255,255,0.5)",
    textDecorationLine: "line-through",
  },
  horaNula: { color: "rgba(255,255,255,0.5)" },
  falta: { fontSize: 12, fontWeight: "600", color: COLORES.acentoClaro },

  nota: { marginTop: 10, paddingLeft: 9, borderLeftWidth: 3 },
  notaTexto: { fontSize: 13, lineHeight: 19, color: "#eaf3f9" },

  salidas: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 10 },
  salida: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  salidaHora: { fontSize: 12.5, fontWeight: "700", color: "#fff" },
  // Tachada, con la corrida al lado: dice "esta se movio" sin pedir que nadie
  // sume minutos de cabeza.
  salidaVieja: {
    fontSize: 12.5,
    color: "rgba(255,255,255,0.5)",
    textDecorationLine: "line-through",
  },
  salidaEstado: { fontSize: 9.5, fontWeight: "800", letterSpacing: 0.4 },

  pie: {
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 11,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.09)",
    fontSize: 11.5,
    lineHeight: 17,
    color: "rgba(255,255,255,0.5)",
  },
});
