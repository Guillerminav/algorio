// Manifiesto de la app. Va como .js y no como app.json para poder leer
// process.env: Expo carga el .env antes de evaluar este archivo, mientras que
// app.json es JSON literal y dejaria escrito "$VARIABLE" tal cual en el build.
//
// OJO: el plugin de react-native-maps no esta en la lista de abajo, asi que
// hoy la clave de Google Maps no se inyecta en ningun lado. Alcanza para Expo
// Go y para iOS (que usa Apple Maps y no pide clave), pero una build de
// Android para la tienda va a mostrar el mapa en blanco. Cuando haga falta,
// se agrega:
//
//   ["react-native-maps", { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY_ANDROID }]

module.exports = {
  expo: {
    name: "AlgoRío",
    slug: "algorio-movil",
    scheme: "algorio",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",

    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.algorio.movil",
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          "AlgoRío usa tu ubicación para mostrarte en el mapa del río y decirte qué paradores tenés cerca.",
      },
    },

    android: {
      package: "com.algorio.movil",
      adaptiveIcon: {
        backgroundColor: "#0b3252",
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
        monochromeImage: "./assets/android-icon-monochrome.png",
      },
      permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"],
    },

    web: { favicon: "./assets/favicon.png" },

    plugins: [
      "expo-router",
      "expo-secure-store",
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "AlgoRío usa tu ubicación para mostrarte en el mapa del río y decirte qué paradores tenés cerca.",
        },
      ],
    ],
  },
};
