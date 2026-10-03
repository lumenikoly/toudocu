import { expect, test } from 'vitest';
import { openAPIDiff } from './openapi.js';

function changeFor(result: ReturnType<typeof openAPIDiff>, field: string) {
  return result.changes.find((change) => change.field === field);
}

test('compares root, operations, parameters, responses, schemas, and security', () => {
  const before = `
openapi: 3.0.0
info: { title: Pets, version: '1' }
paths:
  /pets:
    get:
      operationId: listPets
      parameters:
        - { name: limit, in: query, required: false }
      requestBody:
        required: false
        content: { application/json: { schema: { type: object } } }
      security:
        - apiKey: []
      responses:
        '200':
          description: ok
          headers:
            X-Rate: { schema: { type: integer } }
        '404': { description: missing }
components:
  securitySchemes:
    apiKey: { type: apiKey, in: header, name: X-Key }
  schemas:
    Pet:
      type: object
      enum: [cat, dog]
      required: [id]
      properties:
        id: { type: integer }
        name: { type: string }
`;
  const after = `
openapi: 3.0.0
info: { version: '1', title: Pets }
servers: [{ url: https://example.test }]
paths:
  /pets:
    get:
      operationId: listPets
      parameters:
        - { name: limit, in: query, required: true }
        - { name: tag, in: query, required: false }
      requestBody:
        required: true
        content: { application/json: { schema: { type: object } } }
      security:
        - oauth: [read]
      responses:
        '200':
          description: ok
          headers:
            X-Rate: { schema: { type: string } }
        '201': { description: created }
components:
  securitySchemes:
    oauth: { type: oauth2, flows: {} }
  schemas:
    Pet:
      type: string
      enum: [cat]
      required: [id, name]
      properties:
        id: { type: integer }
        name: { type: string }
        species: { type: string }
`;

  const result = openAPIDiff(
    before,
    new TextEncoder().encode(after),
    'old/CONTRACT-PETS.yaml',
    'new/CONTRACT-PETS.yaml',
  );

  expect(result.available).toBe(true);
  expect(result.changes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ field: 'servers', compatibility: 'informational' }),
      expect.objectContaining({
        field: 'GET /pets.parameters.query:limit',
        compatibility: 'potentially-breaking',
      }),
      expect.objectContaining({
        field: 'GET /pets.parameters.query:tag',
        compatibility: 'non-breaking',
      }),
      expect.objectContaining({
        field: 'GET /pets.requestBody',
        compatibility: 'potentially-breaking',
      }),
      expect.objectContaining({ field: 'GET /pets.security', compatibility: 'breaking' }),
      expect.objectContaining({ field: 'GET /pets.responses.201', compatibility: 'non-breaking' }),
      expect.objectContaining({ field: 'GET /pets.responses.404', compatibility: 'breaking' }),
      expect.objectContaining({
        field: 'GET /pets.responses.200.headers.X-Rate',
        compatibility: 'informational',
      }),
      expect.objectContaining({
        field: 'components.securitySchemes.apiKey',
        compatibility: 'potentially-breaking',
      }),
      expect.objectContaining({
        field: 'components.securitySchemes.oauth',
        compatibility: 'non-breaking',
      }),
      expect.objectContaining({ field: 'components.schemas.Pet.type', compatibility: 'breaking' }),
      expect.objectContaining({ field: 'components.schemas.Pet.enum', compatibility: 'breaking' }),
      expect.objectContaining({
        field: 'components.schemas.Pet.properties.species',
        compatibility: 'non-breaking',
      }),
      expect.objectContaining({
        field: 'components.schemas.Pet.required.name',
        compatibility: 'breaking',
      }),
    ]),
  );
  expect(changeFor(result, 'components.schemas.Pet.properties.id')).toBeUndefined();
  expect(
    result.diagnostics.filter((diagnostic) => diagnostic.code === 'openapi-breaking-change').length,
  ).toBeGreaterThan(0);
});

test('uses canonical map equality and preserves hostile or incomplete names', () => {
  const before = `
openapi: 3.0.0
info: { title: Pets, version: '1' }
paths:
  /pets:
    get:
      parameters:
        - { in: query, required: false }
      responses:
        '200': { description: ok }
components:
  schemas:
    __proto__: { type: object, properties: { constructor: { type: string } } }
`;
  const after = `
info: { version: '1', title: Pets }
openapi: 3.0.0
paths:
  /pets:
    get:
      parameters:
        - { name: id, in: query, required: false }
      responses:
        '200': { description: ok }
components:
  schemas:
    __proto__: { type: object, properties: { constructor: { type: integer } } }
`;

  const result = openAPIDiff(before, after, 'old/CONTRACT-PETS.yaml', 'new/CONTRACT-PETS.yaml');

  expect(result.available).toBe(true);
  expect(changeFor(result, 'openapi')).toBeUndefined();
  expect(changeFor(result, 'info')).toBeUndefined();
  expect(changeFor(result, 'GET /pets.parameters.query:<nil>')).toBeUndefined();
  expect(changeFor(result, 'GET /pets.parameters.query:id')).toEqual(
    expect.objectContaining({ compatibility: 'non-breaking' }),
  );
  expect(changeFor(result, 'components.schemas.__proto__.properties.constructor.type')).toEqual(
    expect.objectContaining({ compatibility: 'breaking' }),
  );
});

test('rejects invalid roots, duplicate keys, recursive aliases, and invalid UTF-8', () => {
  const cases: Array<string | Uint8Array> = [
    '[]',
    'info: { title: Missing version }',
    'openapi: 3.0.0\nopenapi: 3.1.0\n',
    'openapi: 3.0.0\nself: &self { self: *self }\n',
    new Uint8Array([0x6f, 0xff]),
  ];

  for (const input of cases) {
    const result = openAPIDiff(input, 'openapi: 3.0.0\n', 'old.yaml', 'new.yaml');
    expect(result.available).toBe(false);
    expect(result.changes).toEqual([]);
    expect(result.diagnostics[0]?.code).toBe('openapi-old-version-invalid');
  }
});
