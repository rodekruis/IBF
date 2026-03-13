"""
Helper functions for geo data
"""

def coordinate_depth(coords):
    """
    Get depth of coordinate nesting in GeoJSON geometry
    """

    if not isinstance(coords, list) or not coords:
        return 0
    if isinstance(coords[0], (int, float)):
        return 1
    return 1 + coordinate_depth(coords[0])

def normalize_polygon_to_multipolygon(geometry : dict) -> dict:
    """
    Convert Polygon to MultiPolygon geometry
    """
    
    if not isinstance(geometry, dict) or geometry.get('type') != 'Polygon':
        return geometry

    coordinates = geometry.get('coordinates')
    if not isinstance(coordinates, list):
        return geometry

    depth = coordinate_depth(coordinates)

    # If depth 3 (correct polygon nesting), wrap once and return so it's in multipolygon format.
    if depth == 3:
        return {
            'type': 'MultiPolygon',
            'coordinates': [coordinates],
        }

    # If depth 4, it's already in multipolygon format, so return with proper labelling.
    if depth == 4:
        return {
            'type': 'MultiPolygon',
            'coordinates': coordinates,
        }

    return geometry