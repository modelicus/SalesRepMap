/**
 * Builds a Map<GeoJSON feature → CRM data object | null> using the
 * pre-computed gadm-crm-map.json as primary lookup.
 *
 * Usage:
 *   import gadmCrmMap from '../data/gadm-crm-map.json';
 *   import crmData from '../data/crm-data.json';
 *   const featureMap = buildFeatureMap(geojson, gadmCrmMap, crmData.powiaty);
 */

function splitCamelCase(s) {
  return s.replace(/([a-ząćęłńóśźż])([A-ZĄĆĘŁŃÓŚŹŻ])/g, '$1 $2');
}

/** Derives the normalized GADM key (woj/pow) from a GeoJSON feature. */
export function gadmKeyFromFeature(feature) {
  const woj = feature.properties.NAME_1.toLowerCase().trim();
  let name = feature.properties.NAME_2.replace(/\(city\)/i, '');
  name = splitCamelCase(name);
  const pow = name.toLowerCase().trim().replace(/\s+/g, ' ');
  return `${woj}/${pow}`;
}

/**
 * @param {object} geojson - GeoJSON FeatureCollection of powiaty
 * @param {object} gadmCrmMap - gadm-crm-map.json (gadmKey → crmKey | null)
 * @param {object} crmPowiaty - crm-data.json .powiaty (crmKey → {region, handlowiec, baza})
 * @returns {Map<feature, object|null>}
 */
export function buildFeatureMap(geojson, gadmCrmMap, crmPowiaty) {
  const map = new Map();
  for (const feature of geojson.features) {
    const gadmKey = gadmKeyFromFeature(feature);
    if (!(gadmKey in gadmCrmMap)) {
      console.warn(`No GADM map entry for: ${gadmKey}`);
      map.set(feature, null);
      continue;
    }
    const crmKey = gadmCrmMap[gadmKey];
    if (crmKey === null) {
      // Known GADM artifact (e.g., Zalew Szczeciński)
      map.set(feature, null);
      continue;
    }
    map.set(feature, crmPowiaty[crmKey] ?? null);
  }
  return map;
}
