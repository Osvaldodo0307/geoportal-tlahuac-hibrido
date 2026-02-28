export function watchUserLocation({ onUpdate, onError }) {
  if (!navigator.geolocation) {
    onError(new Error("Geolocalizacion no soportada."));
    return null;
  }

  return navigator.geolocation.watchPosition(
    (position) => {
      onUpdate({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: Math.round(position.coords.accuracy)
      });
    },
    (error) => onError(error),
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 2000
    }
  );
}

export function stopWatchingLocation(watchId) {
  if (watchId !== null && watchId !== undefined) {
    navigator.geolocation.clearWatch(watchId);
  }
}

export function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocalizacion no soportada."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy)
        }),
      (error) => reject(error),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 }
    );
  });
}
