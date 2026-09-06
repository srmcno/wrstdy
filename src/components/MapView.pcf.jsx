// Build-time replacement for MapView.jsx in the Power Apps code component.
//
// The real map pulls in Leaflet plus the ~790 KB Council Districts GeoJSON.
// A code component ships one bundle with no runtime code-splitting, so those
// bytes would be downloaded by every user on every screen that hosts the
// control — to render a map a canvas app can already draw itself, with the
// built-in Map control fed from the same SharePoint list.
//
// vite.pcf.config.js aliases MapView.jsx to this file; the standalone build is
// unaffected and keeps the full map.
export function MapView() {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="sh">System Map</div>
      <p style={{ fontSize: 12.5, color: 'var(--mid)', lineHeight: 1.7 }}>
        The map is provided by the surrounding app rather than by this component. Use the
        map screen in the app to locate a system, then open its rate study here.
      </p>
      <p style={{ fontSize: 11.5, color: 'var(--mid)', marginTop: 8 }}>
        Latitude and longitude entered in Step 1 flow back to the app and drive that map.
      </p>
    </div>
  );
}

export default MapView;
