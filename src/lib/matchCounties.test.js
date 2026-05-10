import { describe, it, expect, vi } from 'vitest';
import { gadmKeyFromFeature, buildFeatureMap } from './matchCounties';

describe('gadmKeyFromFeature', () => {
  it('normalizes a simple city name', () => {
    const feature = { properties: { NAME_1: 'Dolnośląskie', NAME_2: 'Wrocław' } };
    expect(gadmKeyFromFeature(feature)).toBe('dolnośląskie/wrocław');
  });

  it('splits CamelCase and lowercases', () => {
    const feature = { properties: { NAME_1: 'Dolnośląskie', NAME_2: 'JeleniaGóra' } };
    expect(gadmKeyFromFeature(feature)).toBe('dolnośląskie/jelenia góra');
  });

  it('strips (City) suffix before normalizing', () => {
    const feature = { properties: { NAME_1: 'Małopolskie', NAME_2: 'Kraków(City)' } };
    expect(gadmKeyFromFeature(feature)).toBe('małopolskie/kraków');
  });

  it('handles CamelCase + (City) together', () => {
    const feature = { properties: { NAME_1: 'Dolnośląskie', NAME_2: 'JeleniaGóra(City)' } };
    expect(gadmKeyFromFeature(feature)).toBe('dolnośląskie/jelenia góra');
  });
});

describe('buildFeatureMap', () => {
  const gadmCrmMap = {
    'dolnośląskie/wrocław': 'dolnośląskie/wrocław',
    'dolnośląskie/bolesławiec': 'dolnośląskie/bolesławiecki',
    'zachodniopomorskie/zalew szczeciński': null,
  };

  const crmPowiaty = {
    'dolnośląskie/wrocław': { region: 'Południe', handlowiec: 'H3', baza: 'Rybnik' },
    'dolnośląskie/bolesławiecki': { region: 'Centrum', handlowiec: 'H2', baza: 'Łódź' },
  };

  const fCity = { properties: { NAME_1: 'Dolnośląskie', NAME_2: 'Wrocław' } };
  const fRural = { properties: { NAME_1: 'Dolnośląskie', NAME_2: 'Bolesławiec' } };
  const fArtifact = { properties: { NAME_1: 'Zachodniopomorskie', NAME_2: 'ZalewSzczeciński' } };
  const fUnknown = { properties: { NAME_1: 'Dolnośląskie', NAME_2: 'Nieznany' } };

  const geojson = { features: [fCity, fRural, fArtifact, fUnknown] };

  it('maps a city feature to its CRM data', () => {
    const map = buildFeatureMap(geojson, gadmCrmMap, crmPowiaty);
    expect(map.get(fCity)).toEqual({ region: 'Południe', handlowiec: 'H3', baza: 'Rybnik' });
  });

  it('maps a rural feature via gadm-crm-map to CRM data', () => {
    const map = buildFeatureMap(geojson, gadmCrmMap, crmPowiaty);
    expect(map.get(fRural)).toEqual({ region: 'Centrum', handlowiec: 'H2', baza: 'Łódź' });
  });

  it('maps a null GADM artifact to null', () => {
    const map = buildFeatureMap(geojson, gadmCrmMap, crmPowiaty);
    expect(map.get(fArtifact)).toBeNull();
  });

  it('returns null and warns for features absent from the GADM map', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const map = buildFeatureMap(geojson, gadmCrmMap, crmPowiaty);
    expect(map.get(fUnknown)).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('dolnośląskie/nieznany'));
    consoleSpy.mockRestore();
  });

  it('returns a Map with one entry per feature', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const map = buildFeatureMap(geojson, gadmCrmMap, crmPowiaty);
    expect(map.size).toBe(4);
    consoleSpy.mockRestore();
  });
});
