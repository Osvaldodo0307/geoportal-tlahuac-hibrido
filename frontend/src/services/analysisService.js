import { distance, point, pointToLineDistance } from "@turf/turf";

function toPointFeature(latlng) {
  return point([latlng.lng, latlng.lat]);
}

function featureName(properties) {
  return (
    properties.NOMBRE ||
    properties.nom_estab ||
    properties.RUTA ||
    properties.LINEA ||
    properties.SISTEMA ||
    "Sin nombre"
  );
}

function getFeatureCoords(feature) {
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords)) {
    return null;
  }
  return {
    lng: Number(coords[0]),
    lat: Number(coords[1])
  };
}

export function nearestStops({ schoolLatLng, stopLayers, radiusMeters = 500, maxItems = 10 }) {
  const schoolPoint = toPointFeature(schoolLatLng);
  const allStops = [];

  for (const layer of stopLayers) {
    for (const feature of layer.features || []) {
      const coords = getFeatureCoords(feature);
      if (!coords) {
        continue;
      }
      const distMeters = distance(
        schoolPoint,
        point([coords.lng, coords.lat]),
        { units: "kilometers" }
      ) * 1000;

      if (distMeters <= radiusMeters) {
        allStops.push({
          feature,
          layerName: layer.layerName,
          distanceMeters: Math.round(distMeters)
        });
      }
    }
  }

  return allStops
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, maxItems)
    .map((item) => ({
      ...item,
      name: featureName(item.feature.properties || {})
    }));
}

export function nearestLines({ schoolLatLng, lineLayers, radiusMeters = 300, maxItems = 10 }) {
  const schoolPoint = toPointFeature(schoolLatLng);
  const allLines = [];

  for (const layer of lineLayers) {
    for (const feature of layer.features || []) {
      const distMeters =
        pointToLineDistance(schoolPoint, feature, { units: "kilometers" }) * 1000;
      if (distMeters <= radiusMeters) {
        allLines.push({
          feature,
          layerName: layer.layerName,
          distanceMeters: Math.round(distMeters)
        });
      }
    }
  }

  return allLines
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, maxItems)
    .map((item) => ({
      ...item,
      name: featureName(item.feature.properties || {})
    }));
}
