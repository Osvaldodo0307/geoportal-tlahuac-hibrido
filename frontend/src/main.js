import L from "leaflet";
import "./styles.css";
import { DEFAULT_CENTER, DEFAULT_ZOOM } from "./config";
import { loadAllData } from "./services/dataService";
import { nearestLines, nearestStops } from "./services/analysisService";
import { calculateRoute } from "./services/routingService";
import {
  getCurrentLocation,
  stopWatchingLocation,
  watchUserLocation
} from "./services/locationService";
import { lineStyleByType, loadIconStyles } from "./utils/mapStyles";

const map = L.map("map").setView(DEFAULT_CENTER, DEFAULT_ZOOM);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap"
}).addTo(map);

const schoolPanel = document.querySelector("#school-panel");
const locationStatus = document.querySelector("#location-status");
const routeStatus = document.querySelector("#route-status");
const stopsRadiusInput = document.querySelector("#stops-radius-input");
const linesRadiusInput = document.querySelector("#lines-radius-input");
const originInput = document.querySelector("#origin-input");
const destinationInput = document.querySelector("#destination-input");
const routeProfileSelect = document.querySelector("#route-profile-select");

const layers = {};
const highlightLayers = {
  stops: L.layerGroup().addTo(map),
  lines: L.layerGroup().addTo(map),
  route: L.layerGroup().addTo(map)
};

let lastLocation = null;
let watchId = null;
let pickMode = null;
let selectedSchool = null;
const layerRefs = {};

function formatMeters(value) {
  return `${Math.round(value)} m`;
}

function schoolName(feature) {
  return (
    feature?.properties?.nom_estab ||
    feature?.properties?.nombre_act ||
    "Escuela sin nombre"
  );
}

function propsHtml(properties, keys) {
  return keys
    .filter((key) => properties[key])
    .map((key) => `<b>${key}:</b> ${properties[key]}`)
    .join("<br/>");
}

function parseLatLng(inputValue) {
  const parts = inputValue.split(",").map((x) => Number(x.trim()));
  if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
    return null;
  }
  return { lat: parts[0], lng: parts[1] };
}

function setInputLatLng(input, latlng) {
  input.value = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
}

function updateSchoolPanel({ schoolFeature, stopResults, lineResults }) {
  const schoolTitle = schoolName(schoolFeature);
  const stopsRows =
    stopResults.length === 0
      ? "<li>Sin paradas cercanas en el radio configurado.</li>"
      : stopResults
          .map(
            (item) =>
              `<li><b>${item.name}</b> - ${item.layerName} (${formatMeters(item.distanceMeters)})</li>`
          )
          .join("");
  const linesRows =
    lineResults.length === 0
      ? "<li>Sin lineas cercanas en el radio configurado.</li>"
      : lineResults
          .map(
            (item) =>
              `<li><b>${item.name}</b> - ${item.layerName} (${formatMeters(item.distanceMeters)})</li>`
          )
          .join("");

  schoolPanel.innerHTML = `
    <b>Escuela:</b> ${schoolTitle}
    <hr/>
    <b>Paradas cercanas</b>
    <ul>${stopsRows}</ul>
    <b>Lineas cercanas</b>
    <ul>${linesRows}</ul>
  `;
}

function runSchoolAnalysis() {
  if (!selectedSchool) {
    return;
  }
  highlightLayers.stops.clearLayers();
  highlightLayers.lines.clearLayers();

  const schoolLatLng = selectedSchool.latlng;
  const stopsRadius = Number(stopsRadiusInput.value) || 500;
  const linesRadius = Number(linesRadiusInput.value) || 300;

  const stopResults = nearestStops({
    schoolLatLng,
    stopLayers: [
      { layerName: "Metro paradas", features: layers.metroParadasData.features },
      { layerName: "RTP paradas", features: layers.rtpParadasData.features }
    ],
    radiusMeters: stopsRadius
  });

  const lineResults = nearestLines({
    schoolLatLng,
    lineLayers: [
      { layerName: "Metro rutas", features: layers.metroRutasData.features },
      { layerName: "RTP rutas", features: layers.rtpRutasData.features },
      { layerName: "Camiones rutas", features: layers.camionesRutasData.features }
    ],
    radiusMeters: linesRadius
  });

  stopResults.forEach((item) => {
    L.geoJSON(item.feature, {
      pointToLayer: (_feature, latlng) =>
        L.circleMarker(latlng, {
          radius: 8,
          color: "#f97316",
          weight: 2,
          fillColor: "#fb923c",
          fillOpacity: 0.6
        })
    })
      .bindPopup(`${item.name}<br/>${item.layerName}<br/>Distancia: ${formatMeters(item.distanceMeters)}`)
      .addTo(highlightLayers.stops);
  });

  lineResults.forEach((item) => {
    L.geoJSON(item.feature, {
      style: {
        color: "#f59e0b",
        weight: 5,
        opacity: 0.85
      }
    })
      .bindPopup(`${item.name}<br/>${item.layerName}<br/>Distancia: ${formatMeters(item.distanceMeters)}`)
      .addTo(highlightLayers.lines);
  });

  updateSchoolPanel({
    schoolFeature: selectedSchool.feature,
    stopResults,
    lineResults
  });
}

function bindSchoolLayer(layer) {
  layer.on("click", (event) => {
    selectedSchool = {
      feature: event.layer.feature,
      latlng: event.latlng
    };
    runSchoolAnalysis();
  });
}

function makeSchoolLayer(data, icons) {
  return L.geoJSON(data, {
    pointToLayer: (feature, latlng) => {
      const marker = L.marker(latlng, { icon: icons.schoolIcon });
      marker.bindPopup(
        propsHtml(feature.properties, ["nom_estab", "raz_social", "nombre_act", "nom_vial"])
      );
      return marker;
    },
    onEachFeature: (_feature, layer) => bindSchoolLayer(layer)
  });
}

function makeParadasLayer(data, icon, popupKeys) {
  return L.geoJSON(data, {
    pointToLayer: (feature, latlng) => {
      const marker = L.marker(latlng, { icon });
      marker.bindPopup(propsHtml(feature.properties, popupKeys));
      return marker;
    }
  });
}

function makeRutasLayer(data, styleType, popupKeys) {
  return L.geoJSON(data, {
    style: lineStyleByType(styleType),
    onEachFeature: (feature, layer) => {
      layer.bindPopup(propsHtml(feature.properties, popupKeys));
    }
  });
}

function makeBoundaryLayer(data, style, popupKeys = []) {
  return L.geoJSON(data, {
    style,
    onEachFeature: (feature, layer) => {
      if (popupKeys.length > 0) {
        layer.bindPopup(propsHtml(feature.properties || {}, popupKeys));
      }
    }
  });
}

function setupLocationButtons() {
  document.querySelector("#start-location-btn").addEventListener("click", () => {
    if (watchId !== null) {
      return;
    }
    watchId = watchUserLocation({
      onUpdate: (loc) => {
        lastLocation = loc;
        locationStatus.textContent = `Estado: activo (precision aprox ${loc.accuracy} m)`;
        if (!layers.userLocationMarker) {
          layers.userLocationMarker = L.circleMarker([loc.lat, loc.lng], {
            radius: 7,
            color: "#0f766e",
            fillColor: "#14b8a6",
            fillOpacity: 0.8
          }).addTo(map);
        } else {
          layers.userLocationMarker.setLatLng([loc.lat, loc.lng]);
        }
      },
      onError: (error) => {
        locationStatus.textContent = `Error de geolocalizacion: ${error.message}`;
      }
    });
  });

  document.querySelector("#stop-location-btn").addEventListener("click", () => {
    stopWatchingLocation(watchId);
    watchId = null;
    locationStatus.textContent = "Estado: inactivo";
  });

  document.querySelector("#center-location-btn").addEventListener("click", () => {
    if (!lastLocation) {
      locationStatus.textContent = "No hay ubicacion disponible aun.";
      return;
    }
    map.setView([lastLocation.lat, lastLocation.lng], 15);
  });

  document.querySelector("#use-my-location-btn").addEventListener("click", async () => {
    try {
      const loc = await getCurrentLocation();
      lastLocation = loc;
      setInputLatLng(originInput, loc);
      map.setView([loc.lat, loc.lng], 15);
      locationStatus.textContent = `Ubicacion obtenida (precision aprox ${loc.accuracy} m)`;
    } catch (error) {
      locationStatus.textContent = `Error al obtener ubicacion: ${error.message}`;
    }
  });
}

function setupPickButtons() {
  document.querySelector("#pick-origin-btn").addEventListener("click", () => {
    pickMode = "origin";
    routeStatus.textContent = "Haz clic en el mapa para definir el origen.";
  });
  document.querySelector("#pick-destination-btn").addEventListener("click", () => {
    pickMode = "destination";
    routeStatus.textContent = "Haz clic en el mapa para definir el destino.";
  });

  map.on("click", (event) => {
    if (pickMode === "origin") {
      setInputLatLng(originInput, event.latlng);
      pickMode = null;
      routeStatus.textContent = "Origen actualizado.";
    } else if (pickMode === "destination") {
      setInputLatLng(destinationInput, event.latlng);
      pickMode = null;
      routeStatus.textContent = "Destino actualizado.";
    }
  });
}

function setupRouteButton() {
  document.querySelector("#route-btn").addEventListener("click", async () => {
    const origin = parseLatLng(originInput.value);
    const destination = parseLatLng(destinationInput.value);
    if (!origin || !destination) {
      routeStatus.textContent = "Ingresa origen y destino validos (lat, lng).";
      return;
    }

    routeStatus.textContent = "Calculando ruta...";
    try {
      const routeData = await calculateRoute({
        origin,
        destination,
        profile: routeProfileSelect.value
      });
      highlightLayers.route.clearLayers();
      L.geoJSON(
        {
          type: "Feature",
          geometry: routeData.geometry,
          properties: {}
        },
        {
          style: { color: "#16a34a", weight: 5, opacity: 0.9 }
        }
      ).addTo(highlightLayers.route);
      routeStatus.textContent = `Ruta lista: ${formatMeters(routeData.distanceMeters)}, ${Math.round(routeData.durationSeconds / 60)} min aprox.`;
    } catch (error) {
      routeStatus.textContent = `Error de ruta: ${error.message}`;
    }
  });
}

function setLayerVisibility(layer, visible) {
  if (!layer) {
    return;
  }
  if (visible && !map.hasLayer(layer)) {
    layer.addTo(map);
  }
  if (!visible && map.hasLayer(layer)) {
    map.removeLayer(layer);
  }
}

function setupLayerToggles() {
  const toggles = [
    { checkbox: "#layer-escuelas", key: "escuelasLayer" },
    { checkbox: "#layer-tlahuac-limite", key: "tlahuacLimiteLayer" },
    { checkbox: "#layer-tlahuac-cp", key: "tlahuacCpLayer" },
    { checkbox: "#layer-metro-paradas", key: "metroParadasLayer" },
    { checkbox: "#layer-rtp-paradas", key: "rtpParadasLayer" },
    { checkbox: "#layer-metro-rutas", key: "metroRutasLayer" },
    { checkbox: "#layer-rtp-rutas", key: "rtpRutasLayer" },
    { checkbox: "#layer-camiones-rutas", key: "camionesRutasLayer" }
  ];

  toggles.forEach(({ checkbox, key }) => {
    const input = document.querySelector(checkbox);
    input?.addEventListener("change", () => {
      setLayerVisibility(layerRefs[key], input.checked);
    });
  });

  document.querySelector("#activate-all-btn")?.addEventListener("click", () => {
    toggles.forEach(({ checkbox, key }) => {
      const input = document.querySelector(checkbox);
      if (input) {
        input.checked = true;
      }
      setLayerVisibility(layerRefs[key], true);
    });
  });

  document.querySelector("#toggle-all-layers-btn")?.addEventListener("click", () => {
    const anyVisible = toggles.some(({ key }) => map.hasLayer(layerRefs[key]));
    toggles.forEach(({ checkbox, key }) => {
      const input = document.querySelector(checkbox);
      const newVisible = !anyVisible;
      if (input) {
        input.checked = newVisible;
      }
      setLayerVisibility(layerRefs[key], newVisible);
    });
  });

  document.querySelector("#clear-highlights-btn")?.addEventListener("click", () => {
    highlightLayers.stops.clearLayers();
    highlightLayers.lines.clearLayers();
    highlightLayers.route.clearLayers();
    schoolPanel.textContent = "Resultados limpiados. Selecciona otra escuela para analizar.";
    routeStatus.textContent = "Ruta: sin calcular";
  });

  document.querySelector("#search-input")?.addEventListener("input", (event) => {
    const value = String(event.target.value || "").toLowerCase().trim();
    const labels = [...document.querySelectorAll(".layer-item")];
    labels.forEach((label) => {
      const text = label.textContent.toLowerCase();
      label.style.display = !value || text.includes(value) ? "block" : "none";
    });
  });
}

async function init() {
  const [allData, icons] = await Promise.all([loadAllData(), loadIconStyles()]);
  layers.tlahuacLimiteData = allData.tlahuacLimite;
  layers.tlahuacCpData = allData.tlahuacCp;
  layers.metroParadasData = allData.metroParadas;
  layers.rtpParadasData = allData.rtpParadas;
  layers.metroRutasData = allData.metroRutas;
  layers.rtpRutasData = allData.rtpRutas;
  layers.camionesRutasData = allData.camionesRutas;

  const tlahuacCpLayer = makeBoundaryLayer(
    allData.tlahuacCp,
    {
      color: "#8fa6b6",
      weight: 1.2,
      opacity: 0.75,
      fill: false
    },
    ["d_cp", "d_asenta", "d_tipo_asenta"]
  ).addTo(map);

  const tlahuacLimiteLayer = makeBoundaryLayer(
    allData.tlahuacLimite,
    {
      color: "#000000",
      weight: 2.4,
      opacity: 0.85,
      fill: false
    },
    ["NOMGEO"]
  ).addTo(map);

  const metroRutasLayer = makeRutasLayer(
    allData.metroRutas,
    "Metro",
    ["SISTEMA", "LINEA", "RUTA"]
  ).addTo(map);
  const rtpRutasLayer = makeRutasLayer(
    allData.rtpRutas,
    "RTP",
    ["SISTEMA", "RUTA", "NOMBRE", "ORIGEN", "DESTINO"]
  ).addTo(map);
  const camionesRutasLayer = makeRutasLayer(
    allData.camionesRutas,
    "Camiones",
    ["SISTEMA", "RUTA", "RAMAL", "DETALLE"]
  ).addTo(map);

  const metroParadasLayer = makeParadasLayer(
    allData.metroParadas,
    icons.metroIcon,
    ["SISTEMA", "NOMBRE", "LINEA", "TIPO"]
  ).addTo(map);
  const rtpParadasLayer = makeParadasLayer(
    allData.rtpParadas,
    icons.rtpIcon,
    ["SISTEMA", "RUTA", "SENTIDO", "ORIG_DEST"]
  ).addTo(map);
  const escuelasLayer = makeSchoolLayer(allData.escuelas, icons).addTo(map);
  layerRefs.metroRutasLayer = metroRutasLayer;
  layerRefs.rtpRutasLayer = rtpRutasLayer;
  layerRefs.camionesRutasLayer = camionesRutasLayer;
  layerRefs.tlahuacLimiteLayer = tlahuacLimiteLayer;
  layerRefs.tlahuacCpLayer = tlahuacCpLayer;
  layerRefs.metroParadasLayer = metroParadasLayer;
  layerRefs.rtpParadasLayer = rtpParadasLayer;
  layerRefs.escuelasLayer = escuelasLayer;

  // Delimitaciones al fondo para no robar protagonismo.
  tlahuacCpLayer.bringToBack();
  tlahuacLimiteLayer.bringToBack();
  // Prioridad visual: escuelas arriba, luego paradas, luego rutas.
  escuelasLayer.bringToFront();
  metroParadasLayer.bringToFront();
  rtpParadasLayer.bringToFront();

  setupLocationButtons();
  setupPickButtons();
  setupRouteButton();
  setupLayerToggles();

  stopsRadiusInput.addEventListener("change", runSchoolAnalysis);
  linesRadiusInput.addEventListener("change", runSchoolAnalysis);
}

init().catch((error) => {
  schoolPanel.textContent = `Error al iniciar: ${error.message}`;
});
