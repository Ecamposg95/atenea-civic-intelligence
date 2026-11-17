export interface AreaProperties {
  id: string;
  name: string;
  code: string | null;
  level: string;
  organization_id: string;
}

export interface AreaFeature {
  type: "Feature";
  geometry: GeoJSON.Geometry | null;
  properties: AreaProperties;
}

export interface AreasResponse {
  type: "FeatureCollection";
  features: AreaFeature[];
}
