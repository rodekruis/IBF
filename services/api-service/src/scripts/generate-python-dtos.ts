/**
 * Generates Python dataclasses from TypeScript DTOs that are also used by
 * the pipelines. See the [api-service README](../../README.md#updating-shared-enums-and-dtos) for details.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE_DIR = 'services/api-service/src/alerts/dto';
const OUTPUT_PATH = resolve(
  __dirname,
  '../../../../data/pipelines/infra/data_types/dtos.py',
);

interface Field {
  /** TS / JSON-payload field name (camelCase). Python attribute is snake_case of this. */
  name: string;
  /** Python type annotation, e.g. `float`, `Layer`, `list[Severity]`. */
  py: string;
  /**
   * Expression rendered inside `to_dict()` for this field. Write in terms of
   * the snake_case Python attribute (e.g. `self.time_interval.to_dict()`).
   * Defaults to `self.<snake_case name>`.
   */
  toDict?: string;
  /** Python default expression, e.g. `field(default_factory=list)`. */
  default?: string;
  /**
   * Optional note rendered as a comment to explain reasons the generated Python may
   * differ from the original DTO.
   */
  exportNote?: string;
}

interface Dataclass {
  name: string;
  sourceDto: string; // file name under SOURCE_DIR, for the header comment
  fields: Field[];
}

const commentStart = '# Difference with the source DTO: ';

const camelToSnake = (camel: string): string =>
  camel.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

// Note: the order of the dataclasses is important.
// Dataclasses that are dependencies of other dataclasses must appear first.
const dataclasses: Dataclass[] = [
  {
    name: 'Centroid',
    sourceDto: 'centroid.dto.ts',
    fields: [
      { name: 'latitude', py: 'float' },
      { name: 'longitude', py: 'float' },
    ],
  },
  {
    name: 'TimeInterval',
    sourceDto: 'time-interval.dto.ts',
    fields: [
      {
        name: 'start',
        py: 'str',
        exportNote:
          'TS DTO uses `Date` (class-transformer parses ISO strings into Date). ' +
          'Python keeps `str` because the pipeline already produces ISO-8601 ' +
          'strings and the JSON payload is identical.',
      },
      { name: 'end', py: 'str' },
    ],
  },
  {
    name: 'Severity',
    sourceDto: 'severity.dto.ts',
    fields: [
      {
        name: 'timeInterval',
        py: 'TimeInterval',
        toDict: 'self.time_interval.to_dict()',
      },
      { name: 'ensembleMemberType', py: 'EnsembleMemberType' },
      { name: 'severityKey', py: 'str' },
      { name: 'severityValue', py: 'float | int' },
    ],
  },
  {
    name: 'ExposureAdminArea',
    sourceDto: 'exposure-admin-area.dto.ts',
    fields: [
      { name: 'placeCode', py: 'str' },
      { name: 'adminLevel', py: 'int' },
      { name: 'layer', py: 'Layer' },
      {
        name: 'value',
        py: 'int | float',
        toDict:
          'int(self.value) if isinstance(self.value, bool) else self.value',
      },
    ],
  },
  {
    name: 'ExposureGeoFeature',
    sourceDto: 'exposure-geo-feature.dto.ts',
    fields: [
      { name: 'geoFeatureId', py: 'str' },
      {
        name: 'layer',
        py: 'Layer',
      },
      {
        name: 'attributes',
        py: 'dict[str, bool | str | int | float]',
      },
    ],
  },
  {
    name: 'RasterExtent',
    sourceDto: 'raster-extent.dto.ts',
    fields: [
      { name: 'xmin', py: 'float' },
      { name: 'ymin', py: 'float' },
      { name: 'xmax', py: 'float' },
      { name: 'ymax', py: 'float' },
    ],
  },
  {
    name: 'ExposureRaster',
    sourceDto: 'exposure-raster.dto.ts',
    fields: [
      {
        name: 'layer',
        py: 'Layer',
      },
      { name: 'value', py: 'str' },
      {
        name: 'extent',
        py: 'RasterExtent',
        toDict: 'self.extent.to_dict()',
      },
    ],
  },
  {
    name: 'Exposure',
    sourceDto: 'exposure.dto.ts',
    fields: [
      {
        name: 'adminAreas',
        py: 'list[ExposureAdminArea]',
        default: 'field(default_factory=list)',
        toDict: '[item.to_dict() for item in self.admin_areas]',
      },
      {
        name: 'geoFeatures',
        py: 'list[ExposureGeoFeature]',
        default: 'field(default_factory=list)',
        toDict: '[item.to_dict() for item in self.geo_features]',
      },
      {
        name: 'rasters',
        py: 'list[ExposureRaster]',
        default: 'field(default_factory=list)',
        toDict: '[item.to_dict() for item in self.rasters]',
      },
    ],
  },
  {
    name: 'Alert',
    sourceDto: 'alert-create.dto.ts',
    fields: [
      { name: 'eventName', py: 'str' },
      {
        name: 'centroid',
        py: 'Centroid',
        toDict: 'self.centroid.to_dict()',
      },
      {
        name: 'severity',
        py: 'list[Severity]',
        default: 'field(default_factory=list)',
        toDict: '[item.to_dict() for item in self.severity]',
      },
      {
        name: 'exposure',
        py: 'Exposure',
        default: 'field(default_factory=Exposure)',
        toDict: 'self.exposure.to_dict()',
      },
    ],
  },
  {
    name: 'Forecast',
    sourceDto: 'forecast-create.dto.ts',
    fields: [
      {
        name: 'issuedAt',
        py: 'datetime',
        toDict: 'self.issued_at.strftime("%Y-%m-%dT%H:%M:%SZ")',
        exportNote:
          'TS DTO uses `Date`. Python keeps `datetime` and serialises to the ' +
          'same `YYYY-MM-DDTHH:MM:SSZ` ISO format the API expects.',
      },
      {
        name: 'hazardType',
        py: 'HazardType',
        toDict: 'str(self.hazard_type)',
      },
      {
        name: 'forecastSources',
        py: 'list[ForecastSource]',
        toDict: '[str(item) for item in self.forecast_sources]',
      },
      {
        name: 'alerts',
        py: 'list[Alert]',
        default: 'field(default_factory=list)',
        toDict: '[item.to_dict() for item in self.alerts]',
      },
    ],
  },
];

const indent = (text: string, spaces: number): string => {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => (line.length > 0 ? pad + line : line))
    .join('\n');
};

const wrapNote = (note: string, width = 88): string => {
  const words = note.split(/\s+/);
  const lines: string[] = [];
  let current = commentStart;
  for (const word of words) {
    if (current.length + word.length + 1 > width && current.trim() !== '#') {
      lines.push(current.trimEnd());
      current = '# ' + word;
    } else {
      current += (current.endsWith(' ') ? '' : ' ') + word;
    }
  }
  if (current.trim() !== '#') lines.push(current.trimEnd());
  return lines.join('\n');
};

const renderField = (f: Field): string => {
  const note = f.exportNote ? wrapNote(f.exportNote) + '\n' : '';
  const pyName = camelToSnake(f.name);
  const decl = f.default
    ? `${pyName}: ${f.py} = ${f.default}`
    : `${pyName}: ${f.py}`;
  return note + decl;
};

const renderToDictEntry = (f: Field): string => {
  const expr = f.toDict ?? `self.${camelToSnake(f.name)}`;
  return `"${f.name}": ${expr},`;
};

const renderDataclass = (dc: Dataclass): string => {
  const fieldLines = dc.fields.map(renderField).join('\n');
  const toDictLines = dc.fields.map(renderToDictEntry).join('\n');
  return [
    `# Source: ${SOURCE_DIR}/${dc.sourceDto}`,
    `@dataclass`,
    `class ${dc.name}:`,
    indent(fieldLines, 4),
    ``,
    `    def to_dict(self) -> JsonDict:`,
    `        return {`,
    indent(toDictLines, 12),
    `        }`,
  ].join('\n');
};

const header = `"""
AUTO-GENERATED code from ${SOURCE_DIR}/*.dto.ts

Python dataclasses mirroring the api-service DTOs.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from pipelines.infra.data_types.enums import (
    EnsembleMemberType,
    ForecastSource,
    HazardType,
    Layer,
)

# Pyright cannot enforce recursive JSON types due to dict invariance.
# This alias documents the intent: values are JSON-serialisable primitives,
# lists, or dicts.
JsonDict = dict[str, object]
`;

const exportNames = dataclasses.map((dc) => `    "${dc.name}",`).join('\n');
const allBlock = `__all__ = [\n${exportNames}\n]`;

const body = dataclasses.map(renderDataclass).join('\n\n\n');
const fileContents = `${header}\n${allBlock}\n\n\n${body}\n`;

writeFileSync(OUTPUT_PATH, fileContents);
console.log(`Wrote ${OUTPUT_PATH}`);
