import type { Map as MapLibreMap } from "maplibre-gl";

export type StreetDirectionLabel = "forward" | "back" | "left" | "right";

export type StreetNode = {
  id: string;
  lng: number;
  lat: number;
  longitude: number;
  latitude: number;
  roadId: string;
  roadName?: string;
  heading: number;
  connectedEdgeIds: string[];
};

export type StreetEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  bearing: number;
  distance: number;
  roadId: string;
  roadName?: string;
  directionType?: StreetDirectionLabel;
};

export type StreetGraph = {
  nodes: StreetNode[];
  edges: StreetEdge[];
  nodesById: Record<string, StreetNode>;
  edgesById: Record<string, StreetEdge>;
  roadLayerIds: string[];
  source: "vector" | "fallback";
};

export type StreetSnap = {
  node: StreetNode;
  edge: StreetEdge;
  projected: [number, number];
  distanceMeters: number;
  heading: number;
  navigable: boolean;
};

export type StreetDirection = {
  id: string;
  edgeId: string;
  label: StreetDirectionLabel;
  directionType: StreetDirectionLabel;
  targetNodeId: string;
  longitude: number;
  latitude: number;
  bearing: number;
  rotation: number;
  relativeAngle: number;
  roadName?: string;
};

type RoadLine = {
  roadId: string;
  roadName?: string;
  coordinates: Array<[number, number]>;
};

const SAMPLE_DISTANCE_METERS = 10;
const INTERSECTION_LINK_METERS = 7.5;
const MAX_ROAD_FEATURES = 120;
const MAX_GRAPH_NODES = 320;
const NAVIGABLE_FALLBACK_RADIUS_METERS = 900;
const ARROW_DISTANCE_METERS = 8;

const FALLBACK_ROADS: RoadLine[] = [
  {
    roadId: "fallback-rivoli",
    roadName: "Rue de Rivoli",
    coordinates: [
      [2.342, 48.8562],
      [2.346, 48.8563],
      [2.35, 48.8565],
      [2.354, 48.8567],
      [2.358, 48.857],
    ],
  },
  {
    roadId: "fallback-sebastopol",
    roadName: "Boulevard de Sebastopol",
    coordinates: [
      [2.35, 48.8532],
      [2.35, 48.8565],
      [2.35, 48.8598],
    ],
  },
  {
    roadId: "fallback-renard",
    roadName: "Rue du Renard",
    coordinates: [
      [2.354, 48.854],
      [2.354, 48.8567],
      [2.354, 48.8592],
    ],
  },
  {
    roadId: "fallback-lombards",
    roadName: "Rue des Lombards",
    coordinates: [
      [2.342, 48.8584],
      [2.346, 48.8586],
      [2.35, 48.8598],
      [2.354, 48.8592],
      [2.358, 48.8593],
    ],
  },
  {
    roadId: "fallback-quai",
    roadName: "Quai de Gesvres",
    coordinates: [
      [2.342, 48.8539],
      [2.346, 48.8541],
      [2.35, 48.8532],
      [2.354, 48.854],
      [2.358, 48.8542],
    ],
  },
];

function toRadians(value: number) {
  return value * Math.PI / 180;
}

function toDegrees(value: number) {
  return value * 180 / Math.PI;
}

export function normalizeBearing(value: number) {
  return ((value % 360) + 360) % 360;
}

export function normalizeRelativeAngle(value: number) {
  const normalized = normalizeBearing(value);
  return normalized > 180 ? normalized - 360 : normalized;
}

function metersPerLngDegree(latitude: number) {
  return 111320 * Math.cos(toRadians(latitude));
}

function toLocalMeters(coordinate: [number, number], originLat: number) {
  return {
    x: coordinate[0] * metersPerLngDegree(originLat),
    y: coordinate[1] * 110540,
  };
}

function distanceMeters(a: StreetNode | [number, number], b: StreetNode | [number, number]) {
  const aLng = Array.isArray(a) ? a[0] : a.longitude;
  const aLat = Array.isArray(a) ? a[1] : a.latitude;
  const bLng = Array.isArray(b) ? b[0] : b.longitude;
  const bLat = Array.isArray(b) ? b[1] : b.latitude;
  const earthRadius = 6371000;
  const deltaLat = toRadians(bLat - aLat);
  const deltaLng = toRadians(bLng - aLng);
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);
  const value = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  return 2 * earthRadius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function bearingCoordinates(from: [number, number], to: [number, number]) {
  const startLat = toRadians(from[1]);
  const endLat = toRadians(to[1]);
  const deltaLng = toRadians(to[0] - from[0]);
  const y = Math.sin(deltaLng) * Math.cos(endLat);
  const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(deltaLng);

  return normalizeBearing(toDegrees(Math.atan2(y, x)));
}

export function bearingBetween(a: StreetNode, b: StreetNode) {
  return bearingCoordinates([a.longitude, a.latitude], [b.longitude, b.latitude]);
}

function interpolate(a: [number, number], b: [number, number], ratio: number): [number, number] {
  return [
    a[0] + (b[0] - a[0]) * ratio,
    a[1] + (b[1] - a[1]) * ratio,
  ];
}

function projectPointOnSegment(point: [number, number], a: [number, number], b: [number, number]) {
  const originLat = point[1];
  const p = toLocalMeters(point, originLat);
  const start = toLocalMeters(a, originLat);
  const end = toLocalMeters(b, originLat);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const ratio = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - start.x) * dx + (p.y - start.y) * dy) / lengthSquared));
  const projected = interpolate(a, b, ratio);

  return {
    coordinate: projected,
    ratio,
    distance: distanceMeters(point, projected),
  };
}

function sampleLine(coordinates: Array<[number, number]>) {
  if (coordinates.length < 2) return coordinates;

  const points: Array<[number, number]> = [coordinates[0]];
  let carry = 0;

  for (let index = 1; index < coordinates.length; index += 1) {
    let start = coordinates[index - 1];
    const end = coordinates[index];
    let segmentDistance = distanceMeters(start, end);

    while (carry + segmentDistance >= SAMPLE_DISTANCE_METERS && segmentDistance > 0) {
      const ratio = (SAMPLE_DISTANCE_METERS - carry) / segmentDistance;
      const nextPoint = interpolate(start, end, ratio);
      points.push(nextPoint);
      start = nextPoint;
      segmentDistance = distanceMeters(start, end);
      carry = 0;
    }

    carry += segmentDistance;
  }

  const last = coordinates[coordinates.length - 1];
  const previous = points[points.length - 1];
  if (!previous || distanceMeters(previous, last) > 1) points.push(last);

  return points;
}

function isCoordinate(value: unknown): value is [number, number] {
  return Array.isArray(value) && typeof value[0] === "number" && typeof value[1] === "number";
}

function getRoadLayerIds(map: MapLibreMap) {
  const layers = map.getStyle().layers || [];

  return layers
    .filter((layer) => {
      const metadata = layer.metadata ? JSON.stringify(layer.metadata).toLowerCase() : "";
      const sourceLayer = "source-layer" in layer && layer["source-layer"] ? String(layer["source-layer"]).toLowerCase() : "";
      const searchable = `${layer.id} ${sourceLayer} ${metadata}`;

      return layer.type === "line"
        && /(road|street|transportation|highway|motorway|primary|secondary|tertiary|service|path|bridge|tunnel)/.test(searchable)
        && !/(label|text|symbol|ferry|rail|contour|pedestrian-label)/.test(searchable);
    })
    .slice(0, 24)
    .map((layer) => layer.id);
}

function getRoadName(properties: GeoJSON.GeoJsonProperties | null | undefined) {
  if (!properties) return undefined;
  return String(properties.name || properties.name_en || properties.ref || properties.class || "").trim() || undefined;
}

function createEmptyGraph(source: StreetGraph["source"], roadLayerIds: string[] = []): StreetGraph {
  return {
    nodes: [],
    edges: [],
    nodesById: {},
    edgesById: {},
    roadLayerIds,
    source,
  };
}

function addNode(
  graph: StreetGraph,
  nodeIndexByKey: Map<string, StreetNode>,
  coordinate: [number, number],
  roadId: string,
  roadName?: string,
) {
  const key = `${coordinate[0].toFixed(5)},${coordinate[1].toFixed(5)}`;
  const existing = nodeIndexByKey.get(key);
  if (existing) return existing;

  const node: StreetNode = {
    id: `street-${graph.nodes.length}`,
    lng: coordinate[0],
    lat: coordinate[1],
    longitude: coordinate[0],
    latitude: coordinate[1],
    roadId,
    roadName,
    heading: 0,
    connectedEdgeIds: [],
  };
  graph.nodes.push(node);
  graph.nodesById[node.id] = node;
  nodeIndexByKey.set(key, node);
  return node;
}

function getPairKey(a: string, b: string) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function connect(
  graph: StreetGraph,
  edgeIdsByPair: Set<string>,
  a: StreetNode,
  b: StreetNode,
  roadId: string,
  roadName?: string,
) {
  if (a.id === b.id) return;
  const pairKey = getPairKey(a.id, b.id);
  if (edgeIdsByPair.has(pairKey)) return;

  const edge: StreetEdge = {
    id: `edge-${graph.edges.length}`,
    fromNodeId: a.id,
    toNodeId: b.id,
    bearing: bearingBetween(a, b),
    distance: distanceMeters(a, b),
    roadId,
    roadName,
  };
  graph.edges.push(edge);
  graph.edgesById[edge.id] = edge;
  a.connectedEdgeIds.push(edge.id);
  b.connectedEdgeIds.push(edge.id);
  edgeIdsByPair.add(pairKey);
}

function connectIntersections(graph: StreetGraph, edgeIdsByPair: Set<string>) {
  for (let index = 0; index < graph.nodes.length; index += 1) {
    const node = graph.nodes[index];

    for (let otherIndex = index + 1; otherIndex < graph.nodes.length; otherIndex += 1) {
      const other = graph.nodes[otherIndex];
      if (node.roadId === other.roadId) continue;
      if (distanceMeters(node, other) > INTERSECTION_LINK_METERS) continue;
      connect(graph, edgeIdsByPair, node, other, "intersection", "Intersection");
    }
  }
}

function createGraphFromRoads(roads: RoadLine[], source: StreetGraph["source"], roadLayerIds: string[] = []): StreetGraph {
  const graph = createEmptyGraph(source, roadLayerIds);
  const nodeIndexByKey = new Map<string, StreetNode>();
  const edgeIdsByPair = new Set<string>();

  for (const road of roads) {
    if (graph.nodes.length >= MAX_GRAPH_NODES) break;
    const route = sampleLine(road.coordinates);
    let previousNode: StreetNode | null = null;

    for (const coordinate of route) {
      if (graph.nodes.length >= MAX_GRAPH_NODES) break;
      const node = addNode(graph, nodeIndexByKey, coordinate, road.roadId, road.roadName);
      if (previousNode) connect(graph, edgeIdsByPair, previousNode, node, road.roadId, road.roadName);
      previousNode = node;
    }
  }

  connectIntersections(graph, edgeIdsByPair);

  for (const node of graph.nodes) {
    const firstEdge = graph.edgesById[node.connectedEdgeIds[0]];
    if (!firstEdge) continue;
    node.heading = edgeBearingFromNode(graph, firstEdge, node);
  }

  return graph;
}

function extractRoadLines(map: MapLibreMap, center: [number, number]): { roads: RoadLine[]; roadLayerIds: string[] } {
  const roadLayerIds = getRoadLayerIds(map);
  if (roadLayerIds.length === 0) return { roads: [], roadLayerIds };

  const centerPoint = map.project(center);
  const radius = 380;
  const features = map.queryRenderedFeatures(
    [[centerPoint.x - radius, centerPoint.y - radius], [centerPoint.x + radius, centerPoint.y + radius]],
    { layers: roadLayerIds },
  );
  const roads: RoadLine[] = [];
  const seen = new Set<string>();

  for (const feature of features.slice(0, MAX_ROAD_FEATURES)) {
    const geometry = feature.geometry;
    const lines = geometry.type === "LineString"
      ? [geometry.coordinates]
      : geometry.type === "MultiLineString"
        ? geometry.coordinates
        : [];

    for (const line of lines) {
      const coordinates = line.filter(isCoordinate) as Array<[number, number]>;
      if (coordinates.length < 2) continue;
      const distance = coordinates.reduce((total, coordinate, index) => {
        if (index === 0) return total;
        return total + distanceMeters(coordinates[index - 1], coordinate);
      }, 0);
      if (distance < 8) continue;

      const sourceLayer = "sourceLayer" in feature ? String(feature.sourceLayer || "") : "";
      const key = `${sourceLayer}:${String(feature.id || "")}:${coordinates[0].join(",")}:${coordinates[coordinates.length - 1].join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);

      roads.push({
        roadId: key || `road-${roads.length}`,
        roadName: getRoadName(feature.properties),
        coordinates,
      });
    }
  }

  return { roads, roadLayerIds };
}

export function buildStreetGraph(map: MapLibreMap, center: [number, number]): StreetGraph {
  const { roads, roadLayerIds } = extractRoadLines(map, center);
  const graph = roads.length > 0 ? createGraphFromRoads(roads, "vector", roadLayerIds) : null;

  if (graph && graph.nodes.length > 3 && graph.edges.length > 2) return graph;
  return createGraphFromRoads(FALLBACK_ROADS, "fallback", roadLayerIds);
}

export function getEdgeTargetNodeId(edge: StreetEdge, currentNodeId: string) {
  return edge.fromNodeId === currentNodeId ? edge.toNodeId : edge.fromNodeId;
}

export function edgeBearingFromNode(graph: StreetGraph, edge: StreetEdge, node: StreetNode) {
  const targetNodeId = getEdgeTargetNodeId(edge, node.id);
  const targetNode = graph.nodesById[targetNodeId];
  return targetNode ? bearingBetween(node, targetNode) : edge.bearing;
}

export function findStreetEdge(graph: StreetGraph, fromNodeId: string, toNodeId: string, preferredEdgeId?: string) {
  if (preferredEdgeId) {
    const edge = graph.edgesById[preferredEdgeId];
    if (edge && (edge.fromNodeId === fromNodeId || edge.toNodeId === fromNodeId) && (edge.fromNodeId === toNodeId || edge.toNodeId === toNodeId)) {
      return edge;
    }
  }

  return graph.edges.find((edge) => (
    (edge.fromNodeId === fromNodeId && edge.toNodeId === toNodeId)
    || (edge.fromNodeId === toNodeId && edge.toNodeId === fromNodeId)
  ));
}

export function findNearestStreetSnap(graph: StreetGraph, longitude: number, latitude: number): StreetSnap {
  const point: [number, number] = [longitude, latitude];
  let bestEdge = graph.edges[0];
  let bestProjection = {
    coordinate: [graph.nodes[0]?.longitude ?? longitude, graph.nodes[0]?.latitude ?? latitude] as [number, number],
    distance: Number.POSITIVE_INFINITY,
    ratio: 0,
  };

  for (const edge of graph.edges) {
    const fromNode = graph.nodesById[edge.fromNodeId];
    const toNode = graph.nodesById[edge.toNodeId];
    if (!fromNode || !toNode) continue;

    const projection = projectPointOnSegment(point, [fromNode.longitude, fromNode.latitude], [toNode.longitude, toNode.latitude]);
    if (projection.distance < bestProjection.distance) {
      bestProjection = projection;
      bestEdge = edge;
    }
  }

  const fromNode = graph.nodesById[bestEdge.fromNodeId];
  const toNode = graph.nodesById[bestEdge.toNodeId];
  const nearestNode = distanceMeters(bestProjection.coordinate, [fromNode.longitude, fromNode.latitude])
    <= distanceMeters(bestProjection.coordinate, [toNode.longitude, toNode.latitude])
    ? fromNode
    : toNode;
  const heading = edgeBearingFromNode(graph, bestEdge, nearestNode);

  return {
    node: nearestNode,
    edge: bestEdge,
    projected: bestProjection.coordinate,
    distanceMeters: bestProjection.distance,
    heading,
    navigable: graph.source === "vector" || bestProjection.distance <= NAVIGABLE_FALLBACK_RADIUS_METERS,
  };
}

function classifyDirection(relativeAngle: number): StreetDirectionLabel {
  if (relativeAngle >= -35 && relativeAngle <= 35) return "forward";
  if (relativeAngle >= 45 && relativeAngle <= 135) return "right";
  if (relativeAngle <= -45 && relativeAngle >= -135) return "left";
  return "back";
}

function getArrowCoordinate(currentNode: StreetNode, targetNode: StreetNode, edgeDistance: number): [number, number] {
  const ratio = edgeDistance <= 12 ? 0.5 : Math.min(0.72, ARROW_DISTANCE_METERS / edgeDistance);
  return interpolate([currentNode.longitude, currentNode.latitude], [targetNode.longitude, targetNode.latitude], ratio);
}

export function getStreetDirections(graph: StreetGraph, nodeId: string, heading: number): StreetDirection[] {
  const currentNode = graph.nodesById[nodeId];
  if (!currentNode) return [];

  const candidates = currentNode.connectedEdgeIds
    .map((edgeId) => {
      const edge = graph.edgesById[edgeId];
      if (!edge) return null;
      const targetNodeId = getEdgeTargetNodeId(edge, nodeId);
      const targetNode = graph.nodesById[targetNodeId];
      if (!targetNode) return null;

      const bearing = edgeBearingFromNode(graph, edge, currentNode);
      const relativeAngle = normalizeRelativeAngle(bearing - heading);
      const label = classifyDirection(relativeAngle);
      const arrowCoordinate = getArrowCoordinate(currentNode, targetNode, edge.distance);

      return {
        score: Math.abs(relativeAngle),
        direction: {
          id: `${nodeId}-${edge.id}-${targetNodeId}`,
          edgeId: edge.id,
          label,
          directionType: label,
          targetNodeId,
          longitude: arrowCoordinate[0],
          latitude: arrowCoordinate[1],
          bearing,
          rotation: bearing,
          relativeAngle,
          roadName: edge.roadName,
        },
      };
    })
    .filter(Boolean) as Array<{ score: number; direction: StreetDirection }>;

  const byLabel = new Map<StreetDirectionLabel, { score: number; direction: StreetDirection }>();

  for (const candidate of candidates) {
    const existing = byLabel.get(candidate.direction.label);
    if (!existing || candidate.score < existing.score) byLabel.set(candidate.direction.label, candidate);
  }

  if (!byLabel.has("forward") && candidates.length > 0) {
    const closest = [...candidates].sort((a, b) => a.score - b.score)[0];
    byLabel.set("forward", {
      ...closest,
      direction: { ...closest.direction, label: "forward", directionType: "forward" },
    });
  }

  return ["forward", "left", "right", "back"]
    .map((label) => byLabel.get(label as StreetDirectionLabel)?.direction)
    .filter(Boolean) as StreetDirection[];
}
