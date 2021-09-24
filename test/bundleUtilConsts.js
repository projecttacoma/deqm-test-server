const URN_REPLACE_REFERENCES_ENTRIES = [
  {
    fullUrl: 'urn:uuid:61ebe359-bfdc-4613-8bf2-c5e300945f0a',
    resource: {
      resourceType: 'Patient',
      gender: 'male',
      birthDate: '1974-12-25'
    },
    request: {
      method: 'POST',
      url: 'Patient'
    }
  },
  {
    fullUrl: 'urn:uuid:88f151c0-a954-468a-88bd-5ae15c08e059',
    resource: {
      resourceType: 'Patient',
      gender: 'male',
      birthDate: '1974-12-25',
      reference: 'urn:uuid:61ebe359-bfdc-4613-8bf2-c5e300945f0a'
    },
    request: {
      method: 'POST',
      url: 'Patient',
      ifNoneExist: 'identifier=http://example.org/fhir/ids|234234'
    }
  }
];

const RESOURCETYPE_REPLACE_REFERENCES_ENTRIES = [
  {
    resource: {
      id: '61ebe359-bfdc-4613-8bf2-c5e300945f0a',
      resourceType: 'Patient',
      gender: 'male',
      birthDate: '1974-12-25'
    },
    request: {
      method: 'POST',
      url: 'Patient'
    }
  },
  {
    resource: {
      id: '88f151c0-a954-468a-88bd-5ae15c08e059',
      resourceType: 'Patient',
      gender: 'male',
      birthDate: '1974-12-25',
      reference: 'Patient/61ebe359-bfdc-4613-8bf2-c5e300945f0a'
    },
    request: {
      method: 'POST',
      url: 'Patient',
      ifNoneExist: 'identifier=http://example.org/fhir/ids|234234'
    }
  }
];

const BOTH_REPLACE_REFERENCES_ENTRIES = [
  {
    fullUrl: 'urn:uuid:61ebe359-bfdc-4613-8bf2-c5e300945f0a',
    resource: {
      resourceType: 'Patient',
      gender: 'male',
      birthDate: '1974-12-25'
    },
    request: {
      method: 'POST',
      url: 'Patient'
    }
  },
  {
    resource: {
      id: '88f151c0-a954-468a-88bd-5ae15c08e059',
      resourceType: 'Patient',
      gender: 'male',
      birthDate: '1974-12-25',
      reference: 'Patient/61ebe359-bfdc-4613-8bf2-c5e300945f0a'
    },
    request: {
      method: 'POST',
      url: 'Patient',
      ifNoneExist: 'identifier=http://example.org/fhir/ids|234234'
    }
  }
];

const EXPECTED_REPLACE_REFERENCES_OUTPUT = [
  {
    resource: {
      id: 'Patient-0',
      resourceType: 'Patient',
      gender: 'male',
      birthDate: '1974-12-25'
    },
    request: {
      method: 'PUT',
      url: 'Patient/Patient-0'
    }
  },
  {
    resource: {
      id: 'Patient-1',
      resourceType: 'Patient',
      gender: 'male',
      birthDate: '1974-12-25',
      reference: 'Patient/Patient-0'
    },
    request: {
      method: 'PUT',
      url: 'Patient/Patient-1'
    }
  }
];

module.exports = {
  URN_REPLACE_REFERENCES_ENTRIES,
  RESOURCETYPE_REPLACE_REFERENCES_ENTRIES,
  BOTH_REPLACE_REFERENCES_ENTRIES,
  EXPECTED_REPLACE_REFERENCES_OUTPUT
};
