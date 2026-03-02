import L from "leaflet";
import "./styles.css";
import { DEFAULT_CENTER, DEFAULT_ZOOM } from "./config";
import { loadAllData } from "./services/dataService";
import { nearestLines, nearestStops } from "./services/analysisService";
import { calculateRoute } from "./services/routingService";
import {
  stopWatchingLocation,
  watchUserLocation
} from "./services/locationService";
import { lineStyleByType, loadIconStyles } from "./utils/mapStyles";
import {
  lineString,
  nearestPointOnLine,
  point,
  pointToLineDistance
} from "@turf/turf";

const map = L.map("map").setView(DEFAULT_CENTER, DEFAULT_ZOOM);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap"
}).addTo(map);

const schoolPanel = document.querySelector("#school-panel");
const locationStatus = document.querySelector("#location-status");
const stopsRadiusInput = document.querySelector("#stops-radius-input");
const linesRadiusInput = document.querySelector("#lines-radius-input");
const schoolSelect = document.querySelector("#school-select");
const transitPanelStatus = document.querySelector("#transit-panel-status");
const transitOptionsList = document.querySelector("#transit-options-list");
const transitPanel = document.querySelector(".right-panel");
const transitPanelToggle = document.querySelector("#transit-panel-toggle");

const layers = {};
const highlightLayers = {
  school: L.layerGroup().addTo(map),
  stops: L.layerGroup().addTo(map),
  lines: L.layerGroup().addTo(map),
  route: L.layerGroup().addTo(map)
};

let lastLocation = null;
let watchId = null;
let selectedSchool = null;
const layerRefs = {};
const schoolSearchIndex = [];
const schoolByName = new Map();
let latestTransitOptions = [];
let isTransitPanelCollapsed = false;

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

function updateSchoolPanel({ schoolFeature, stopResults, lineResults, liveOptions = [], hasLiveLocation = false }) {
  const schoolTitle = schoolName(schoolFeature);
  const countByLayer = (rows, layerName) =>
    rows.filter((x) => x.layerName === layerName).length;
  const minDist = (rows, layerName) => {
    const items = rows
      .filter((x) => x.layerName === layerName)
      .map((x) => x.distanceMeters);
    return items.length ? Math.min(...items) : null;
  };
  const dashboardCards = [
    {
      label: "Metro parada mas cercana",
      value: minDist(stopResults, "Metro paradas")
    },
    {
      label: "RTP parada mas cercana",
      value: minDist(stopResults, "RTP paradas")
    },
    {
      label: "Metro rutas cercanas",
      value: countByLayer(lineResults, "Metro rutas")
    },
    {
      label: "RTP rutas cercanas",
      value: countByLayer(lineResults, "RTP rutas")
    },
    {
      label: "Camiones rutas cercanas",
      value: countByLayer(lineResults, "Camiones rutas")
    }
  ];

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
    <div class="dashboard-stats">
      ${dashboardCards
        .map((card) => {
          const valueText =
            card.value === null || card.value === 0 ? "N/A" : `${card.value}${card.label.includes("parada mas cercana") ? " m" : ""}`;
          return `<div class="stat-card"><span>${card.label}</span><b>${valueText}</b></div>`;
        })
        .join("")}
    </div>
    <hr/>
    <b>Opciones desde tu ubicacion</b>
    <ul>
      ${
        !hasLiveLocation
          ? "<li>Activa ubicacion en tiempo real para sugerencias de llegada.</li>"
          : liveOptions.length === 0
            ? "<li>Sin opciones claras en el radio actual. Amplia el radio de analisis.</li>"
            : liveOptions
                .map(
                  (opt) =>
                    `<li><b>${opt.mode}</b> - indice aprox: ${opt.score} m (${opt.detail})</li>`
                )
                .join("")
      }
    </ul>
    <hr/>
    <b>Paradas cercanas</b>
    <ul>${stopsRows}</ul>
    <b>Lineas cercanas</b>
    <ul>${linesRows}</ul>
  `;
}

function selectSchool({ feature, latlng }) {
  selectedSchool = { feature, latlng };
  const selectedName =
    feature?.properties?.nom_estab ||
    feature?.properties?.nombre_act;
  if (selectedName && schoolSelect && schoolByName.has(selectedName)) {
    schoolSelect.value = selectedName;
  }
  highlightLayers.school.clearLayers();
  L.circleMarker([latlng.lat, latlng.lng], {
    radius: 16,
    color: "#ffffff",
    weight: 3,
    fillColor: "#ffd9a8",
    fillOpacity: 0.36
  }).addTo(highlightLayers.school);
  L.circleMarker([latlng.lat, latlng.lng], {
    radius: 8.5,
    color: "#fff8d6",
    weight: 2,
    fillColor: "#b30012",
    fillOpacity: 0.95
  }).addTo(highlightLayers.school);
  const nextZoom = Math.min(17, Math.max(map.getZoom() + 1, 15));
  map.flyTo([latlng.lat, latlng.lng], nextZoom, {
    duration: 0.8
  });
  runSchoolAnalysis();
}

function nearestPointOnFeatureLine(feature, sourceLatLng) {
  const geometry = feature?.geometry;
  if (!geometry?.type || !geometry?.coordinates) {
    return null;
  }
  const source = point([sourceLatLng.lng, sourceLatLng.lat]);
  let best = null;
  let bestDist = Number.POSITIVE_INFINITY;
  if (geometry.type === "LineString") {
    try {
      const p = nearestPointOnLine(feature, source);
      return {
        lat: p.geometry.coordinates[1],
        lng: p.geometry.coordinates[0]
      };
    } catch {
      return null;
    }
  }
  if (geometry.type === "MultiLineString") {
    geometry.coordinates.forEach((coords) => {
      if (!Array.isArray(coords) || coords.length < 2) {
        return;
      }
      const ls = lineString(coords);
      const d = pointToLineDistance(source, ls, { units: "kilometers" });
      if (d < bestDist) {
        bestDist = d;
        best = nearestPointOnLine(ls, source);
      }
    });
    if (best) {
      return {
        lat: best.geometry.coordinates[1],
        lng: best.geometry.coordinates[0]
      };
    }
  }
  return null;
}

function renderTransitOptions(options) {
  latestTransitOptions = options;
  if (!transitOptionsList || !transitPanelStatus) {
    return;
  }
  transitOptionsList.innerHTML = "";
  if (!selectedSchool) {
    transitPanelStatus.textContent =
      "Selecciona una escuela para ver opciones de transporte.";
    return;
  }
  if (options.length === 0) {
    transitPanelStatus.textContent =
      "No hay opciones en el radio actual. Amplia radios de análisis.";
    return;
  }
  transitPanelStatus.textContent = `${options.length} opciones ordenadas por cercania.`;
  options.forEach((opt, idx) => {
    const box = document.createElement("div");
    box.className = "transit-option";
    box.innerHTML = `
      <div class="top">
        <span>${idx + 1}. ${opt.mode}</span>
        <span>${opt.distanceMeters} m</span>
      </div>
      <div class="small muted">${opt.name}</div>
      <button data-opt-idx="${idx}">Trazar caminata a esta opcion</button>
    `;
    transitOptionsList.appendChild(box);
  });
}

function setTransitPanelCollapsed(nextValue) {
  isTransitPanelCollapsed = Boolean(nextValue);
  if (!transitPanel || !transitPanelToggle) {
    return;
  }
  transitPanel.classList.toggle("collapsed", isTransitPanelCollapsed);
  transitPanelToggle.textContent = isTransitPanelCollapsed ? "Ver opciones" : "Ocultar";
}

function setupTransitPanelToggle() {
  if (!transitPanel || !transitPanelToggle) {
    return;
  }
  const startsCollapsedOnMobile = window.matchMedia("(max-width: 1000px)").matches;
  setTransitPanelCollapsed(startsCollapsedOnMobile);
  transitPanelToggle.addEventListener("click", () => {
    setTransitPanelCollapsed(!isTransitPanelCollapsed);
  });
}

async function traceWalkingAccess(option) {
  if (!selectedSchool) {
    return;
  }
  const origin = selectedSchool.latlng;
  const destination = option.targetLatLng;
  if (!destination) {
    return;
  }
  transitPanelStatus.textContent = `Calculando caminata a ${option.mode}...`;
  try {
    const routeData = await calculateRoute({
      origin,
      destination,
      profile: "walking"
    });
    highlightLayers.route.clearLayers();
    L.geoJSON(
      {
        type: "Feature",
        geometry: routeData.geometry,
        properties: {}
      },
      {
        style: { color: "#ffe38c", weight: 4, opacity: 0.85, dashArray: "6,5" }
      }
    ).addTo(highlightLayers.route);
    transitPanelStatus.textContent = `Caminata estimada: ${Math.round(routeData.durationSeconds / 60)} min, ${routeData.distanceMeters} m.`;
  } catch {
    transitPanelStatus.textContent = "No se pudo trazar la caminata para esta opcion.";
  }
}

function minDistanceByMode(items) {
  const modeOf = (layerName) => {
    if (layerName.includes("Metro")) {
      return "Metro";
    }
    if (layerName.includes("RTP")) {
      return "RTP";
    }
    return "Camiones";
  };
  const result = new Map();
  items.forEach((item) => {
    const mode = modeOf(item.layerName);
    const current = result.get(mode);
    if (current === undefined || item.distanceMeters < current) {
      result.set(mode, item.distanceMeters);
    }
  });
  return result;
}

function buildLiveLocationOptions({ schoolLatLng, schoolStopResults, schoolLineResults }) {
  if (!lastLocation) {
    return [];
  }

  const userStops = nearestStops({
    schoolLatLng: lastLocation,
    stopLayers: [
      { layerName: "Metro paradas", features: layers.metroParadasData.features },
      { layerName: "RTP paradas", features: layers.rtpParadasData.features }
    ],
    radiusMeters: 1500,
    maxItems: 40
  });

  const userLines = nearestLines({
    schoolLatLng: lastLocation,
    lineLayers: [
      { layerName: "Metro rutas", features: layers.metroRutasData.features },
      { layerName: "RTP rutas", features: layers.rtpRutasData.features },
      { layerName: "Camiones rutas", features: layers.camionesRutasData.features }
    ],
    radiusMeters: 1200,
    maxItems: 40
  });

  const schoolStopsByMode = minDistanceByMode(schoolStopResults);
  const schoolLinesByMode = minDistanceByMode(schoolLineResults);
  const userStopsByMode = minDistanceByMode(userStops);
  const userLinesByMode = minDistanceByMode(userLines);

  const modes = ["Metro", "RTP", "Camiones"];
  const options = [];
  modes.forEach((mode) => {
    const accessUser = Math.min(
      userStopsByMode.get(mode) ?? Number.POSITIVE_INFINITY,
      userLinesByMode.get(mode) ?? Number.POSITIVE_INFINITY
    );
    const accessSchool = Math.min(
      schoolStopsByMode.get(mode) ?? Number.POSITIVE_INFINITY,
      schoolLinesByMode.get(mode) ?? Number.POSITIVE_INFINITY
    );
    if (!Number.isFinite(accessUser) || !Number.isFinite(accessSchool)) {
      return;
    }
    const score = Math.round(accessUser + accessSchool);
    options.push({
      mode,
      score,
      detail: `acceso usuario ${Math.round(accessUser)} m + acceso escuela ${Math.round(accessSchool)} m`
    });
  });

  return options.sort((a, b) => a.score - b.score).slice(0, 3);
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
        color: "#f8cf7c",
        weight: 3,
        opacity: 0.42
      }
    })
      .bindPopup(`${item.name}<br/>${item.layerName}<br/>Distancia: ${formatMeters(item.distanceMeters)}`)
      .addTo(highlightLayers.lines);
  });

  // Enciende automaticamente las capas de transporte relacionadas al resultado.
  const shouldShow = {
    metroParadas: stopResults.some((x) => x.layerName === "Metro paradas"),
    rtpParadas: stopResults.some((x) => x.layerName === "RTP paradas"),
    metroRutas: lineResults.some((x) => x.layerName === "Metro rutas"),
    rtpRutas: lineResults.some((x) => x.layerName === "RTP rutas"),
    camionesRutas: lineResults.some((x) => x.layerName === "Camiones rutas")
  };
  const applyLayer = (checkboxId, layer, enabled) => {
    if (!enabled) {
      return;
    }
    const check = document.querySelector(checkboxId);
    if (check) {
      check.checked = true;
    }
    setLayerVisibility(layer, true);
  };
  applyLayer("#layer-metro-paradas", layerRefs.metroParadasLayer, shouldShow.metroParadas);
  applyLayer("#layer-rtp-paradas", layerRefs.rtpParadasLayer, shouldShow.rtpParadas);
  applyLayer("#layer-metro-rutas", layerRefs.metroRutasLayer, shouldShow.metroRutas);
  applyLayer("#layer-rtp-rutas", layerRefs.rtpRutasLayer, shouldShow.rtpRutas);
  applyLayer("#layer-camiones-rutas", layerRefs.camionesRutasLayer, shouldShow.camionesRutas);
  applyVisualDensityMode();

  const transportOptions = [
    ...stopResults.map((item) => ({
      mode: item.layerName.includes("Metro")
        ? "Metro"
        : item.layerName.includes("RTP")
          ? "RTP"
          : "Camiones",
      name: item.name,
      layerName: item.layerName,
      distanceMeters: item.distanceMeters,
      targetLatLng: {
        lat: item.feature.geometry.coordinates[1],
        lng: item.feature.geometry.coordinates[0]
      }
    })),
    ...lineResults
      .map((item) => ({
        mode: item.layerName.includes("Metro")
          ? "Metro"
          : item.layerName.includes("RTP")
            ? "RTP"
            : "Camiones",
        name: item.name,
        layerName: item.layerName,
        distanceMeters: item.distanceMeters,
        targetLatLng: nearestPointOnFeatureLine(item.feature, schoolLatLng)
      }))
      .filter((x) => Boolean(x.targetLatLng))
  ]
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, 12);

  renderTransitOptions(transportOptions);

  const liveOptions = buildLiveLocationOptions({
    schoolLatLng,
    schoolStopResults: stopResults,
    schoolLineResults: lineResults
  });

  updateSchoolPanel({
    schoolFeature: selectedSchool.feature,
    stopResults,
    lineResults,
    liveOptions,
    hasLiveLocation: Boolean(lastLocation)
  });
}

function bindSchoolLayer(layer) {
  layer.on("click", (event) => {
    selectSchool({
      feature: event.layer.feature,
      latlng: event.latlng
    });
  });
}

function makeSchoolLayer(data, icons) {
  return L.geoJSON(data, {
    pointToLayer: (feature, latlng) => {
      const schoolLabel =
        feature?.properties?.nom_estab ||
        feature?.properties?.nombre_act ||
        "Escuela sin nombre";
      schoolSearchIndex.push({
        id: String(feature?.properties?.id ?? schoolSearchIndex.length + 1),
        nom_estab: schoolLabel,
        feature,
        latlng
      });
      if (!schoolByName.has(schoolLabel)) {
        schoolByName.set(schoolLabel, {
          feature,
          latlng
        });
      }
      const marker = L.marker(latlng, { icon: icons.schoolIcon });
      marker.bindPopup(
        propsHtml(feature.properties, ["nom_estab", "raz_social", "nombre_act", "nom_vial"])
      );
      return marker;
    },
    onEachFeature: (_feature, layer) => bindSchoolLayer(layer)
  });
}

function populateSchoolSelect() {
  const schools = [...schoolByName.keys()].sort((a, b) =>
    a.localeCompare(b, "es")
  );

  schools.forEach((schoolNameOption) => {
    const option = document.createElement("option");
    option.value = schoolNameOption;
    option.textContent = schoolNameOption;
    schoolSelect?.appendChild(option);
  });
}

function setupSchoolSearch() {
  const searchButton = document.querySelector("#search-school-btn");
  const runSearch = () => {
    if (!schoolSelect?.value) {
      schoolPanel.textContent = "Selecciona una escuela del listado para analizar.";
      return;
    }
    const school = schoolByName.get(schoolSelect.value);
    if (!school) {
      schoolPanel.textContent = "No se encontro la escuela seleccionada.";
      return;
    }
    selectSchool({
      feature: school.feature,
      latlng: school.latlng
    });
  };

  searchButton?.addEventListener("click", runSearch);
  schoolSelect?.addEventListener("change", runSearch);
}

function applyVisualDensityMode() {
  const managedLayers = [
    layerRefs.escuelasLayer,
    layerRefs.tlahuacLimiteLayer,
    layerRefs.tlahuacCpLayer,
    layerRefs.metroParadasLayer,
    layerRefs.rtpParadasLayer,
    layerRefs.metroRutasLayer,
    layerRefs.rtpRutasLayer,
    layerRefs.camionesRutasLayer
  ].filter(Boolean);
  const activeCount = managedLayers.filter((layer) => map.hasLayer(layer)).length;
  const denseMode = activeCount >= 7;

  if (layerRefs.metroRutasLayer?.setStyle) {
    layerRefs.metroRutasLayer.setStyle({
      color: "#f59e0b",
      weight: denseMode ? 2.2 : 3,
      opacity: denseMode ? 0.6 : 0.9
    });
  }
  if (layerRefs.rtpRutasLayer?.setStyle) {
    layerRefs.rtpRutasLayer.setStyle({
      color: "#0b8f3a",
      weight: denseMode ? 2.2 : 3,
      opacity: denseMode ? 0.62 : 0.9
    });
  }
  if (layerRefs.camionesRutasLayer?.setStyle) {
    layerRefs.camionesRutasLayer.setStyle({
      color: "#7e6aa8",
      weight: denseMode ? 2 : 2.4,
      opacity: denseMode ? 0.5 : 0.65,
      dashArray: "4,6"
    });
  }
  if (layerRefs.tlahuacCpLayer?.setStyle) {
    layerRefs.tlahuacCpLayer.setStyle({
      color: "#8fa6b6",
      weight: denseMode ? 1 : 1.2,
      opacity: denseMode ? 0.5 : 0.75,
      fill: false
    });
  }
  if (layerRefs.tlahuacLimiteLayer?.setStyle) {
    layerRefs.tlahuacLimiteLayer.setStyle({
      color: "#000000",
      weight: denseMode ? 3 : 3.8,
      opacity: denseMode ? 0.7 : 0.85,
      fill: false
    });
  }

  const transportMarkerOpacity = denseMode ? 0.55 : 1;
  [layerRefs.metroParadasLayer, layerRefs.rtpParadasLayer].forEach((groupLayer) => {
    if (!groupLayer?.eachLayer) {
      return;
    }
    groupLayer.eachLayer((markerLayer) => {
      if (markerLayer?.setOpacity) {
        markerLayer.setOpacity(transportMarkerOpacity);
      }
    });
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
        if (selectedSchool) {
          runSchoolAnalysis();
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
      applyVisualDensityMode();
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
    applyVisualDensityMode();
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
    applyVisualDensityMode();
  });

  document.querySelector("#clear-highlights-btn")?.addEventListener("click", () => {
    highlightLayers.school.clearLayers();
    highlightLayers.stops.clearLayers();
    highlightLayers.lines.clearLayers();
    highlightLayers.route.clearLayers();
    renderTransitOptions([]);
    schoolPanel.textContent = "Resultados limpiados. Selecciona otra escuela para analizar.";
  });

  document.querySelector("#search-input")?.addEventListener("input", (event) => {
    const value = String(event.target.value || "").toLowerCase().trim();
    const labels = [...document.querySelectorAll(".layer-item")];
    labels.forEach((label) => {
      const text = label.textContent.toLowerCase();
      label.style.display = !value || text.includes(value) ? "block" : "none";
    });
  });

  // Aplica el estado inicial de visibilidad segun los checkboxes del panel.
  toggles.forEach(({ checkbox, key }) => {
    const input = document.querySelector(checkbox);
    setLayerVisibility(layerRefs[key], Boolean(input?.checked));
  });
}

function setupTransitOptionActions() {
  transitOptionsList?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const idx = target.getAttribute("data-opt-idx");
    if (idx === null) {
      return;
    }
    const option = latestTransitOptions[Number(idx)];
    if (!option) {
      return;
    }
    traceWalkingAccess(option);
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
      weight: 3.8,
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
  setupLayerToggles();
  setupTransitOptionActions();
  setupTransitPanelToggle();
  populateSchoolSelect();
  setupSchoolSearch();
  applyVisualDensityMode();

  stopsRadiusInput.addEventListener("change", runSchoolAnalysis);
  linesRadiusInput.addEventListener("change", runSchoolAnalysis);
}

init().catch((error) => {
  schoolPanel.textContent = `Error al iniciar: ${error.message}`;
});
