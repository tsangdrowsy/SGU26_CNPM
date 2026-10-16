// src/features/map/mapHtml.ts

import { POI } from "../../data/mockPois";

export function buildMapHtml(
  pois: POI[],
  center: { latitude: number; longitude: number }
): string {
  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport"
      content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
      html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; background: #fff; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script>
      var pois = ${JSON.stringify(pois)};

      var map = L.map("map").setView([${center.latitude}, ${center.longitude}], 17);

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
      }).addTo(map);

      var userMarker = null;

      function post(payload) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        }
      }

      map.on("click", function () { post({ type: "MAP_TAPPED" }); });

      pois.forEach(function (poi) {
        L.circle([poi.latitude, poi.longitude], {
          radius: poi.radiusMeters || 20,
          color: "#f97316",
          fillColor: "#f97316",
          fillOpacity: 0.1,
          weight: 1
        }).addTo(map);

        var marker = L.circleMarker([poi.latitude, poi.longitude], {
          radius: 9,
          color: "#f97316",
          fillColor: "#f97316",
          fillOpacity: 0.9,
          weight: 2
        }).addTo(map);

        marker.bindPopup(
          '<div style="font-weight:700;margin-bottom:4px;">' + poi.name +
          '</div><div style="font-size:13px;">' + poi.shortDescription + "</div>"
        );

        marker.on("click", function () {
          post({ type: "POI_SELECTED", payload: poi });
        });
      });

      window.updateUserLocation = function (lat, lng, accuracy) {
        if (!userMarker) {
          userMarker = L.circleMarker([lat, lng], {
            radius: 7, color: "#2563eb", fillColor: "#2563eb", fillOpacity: 1, weight: 2
          }).addTo(map);
        } else {
          userMarker.setLatLng([lat, lng]);
        }
      };

      post({ type: "MAP_READY" });
    </script>
  </body>
</html>
`;
}