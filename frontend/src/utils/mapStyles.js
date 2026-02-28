import L from "leaflet";

function toLeafletIcon(styleData, fallbackIconUrl) {
  const iconUrl = styleData?.leaflet?.iconUrl?.startsWith("icons/")
    ? `/${styleData.leaflet.iconUrl}`
    : fallbackIconUrl;

  const iconSize = styleData?.leaflet?.iconSize || [20, 20];
  const iconAnchor = styleData?.leaflet?.iconAnchor || [10, 10];

  return L.icon({
    iconUrl,
    iconSize,
    iconAnchor
  });
}

export function schoolsStyle() {
  return {
    radius: 7,
    fillColor: "#f59e0b",
    color: "#7c2d12",
    weight: 1,
    fillOpacity: 0.9
  };
}

export function lineStyleByType(type) {
  if (type === "Metro") {
    return { color: "#f59e0b", weight: 3, opacity: 0.9 };
  }
  if (type === "RTP") {
    return { color: "#0b8f3a", weight: 3, opacity: 0.9 };
  }
  return { color: "#7e6aa8", weight: 2.4, opacity: 0.65, dashArray: "4,6" };
}

export async function loadIconStyles() {
  const [metroStyleRes, rtpStyleRes] = await Promise.all([
    fetch("/styles/Estaciones_metro.webstyle.json"),
    fetch("/styles/Paradas_RTP.webstyle.json")
  ]);
  const metroStyle = await metroStyleRes.json();
  const rtpStyle = await rtpStyleRes.json();
  return {
    metroIcon: toLeafletIcon(metroStyle, "/icons/transport_train_station.svg"),
    rtpIcon: toLeafletIcon(rtpStyle, "/icons/rtp.png"),
    schoolIcon: L.icon({
      iconUrl: "/icons/secundaria.png",
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    })
  };
}
