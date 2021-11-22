const { validateResourceType } = require('../src/util/validator');
const validPatient = require('./fixtures/validation/validPatient.json');
const invalidPatient = require('./fixtures/validation/invalidPatient.json');
const invalidResourceType = { resourceType: 'foo' };
describe('JSON Schema Validator tests', () => {
  test('Should say resource is valid with 0 errors when given a good resource', () => {
    validateResourceType(validPatient);
  });
  // prettier-ignore
  test('Should say resource is invalid with concise errors when given bad resource and default options', () => {
    try {
        validateResourceType(invalidPatient);
      } catch (e) {
        expect(e.statusCode).toEqual(400);
        expect(e.issue[0].details.text).toHaveLength(2);
        expect(e.issue[0].details.text).toEqual(
            [
                {
                  dataPath: '.address[0].city',
                  keyword: 'type',
                  message: 'should be string',
                  params: { type: 'string' },
                  schemaPath: '#/definitions/string/type',
                },
                {
                  dataPath: '',
                  keyword: 'oneOf',
                  message: 'should match exactly one schema in oneOf',
                  params: { passingSchemas: null },
                  schemaPath: '#/oneOf',
                },
              ]);
      }
    
  });
  test('Should say resourceType is invalid when given unknown resourceType', () => {
    try {
      validateResourceType(invalidResourceType);
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toHaveLength(1);
      expect(e.issue[0].details.text[0]).toContain("Invalid resourceType 'foo'");
    }
  });
});
