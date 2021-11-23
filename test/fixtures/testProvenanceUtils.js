const DELEGATOR_WHO = {
  reference: 'Practitioner/456',
  type: 'Practitioner'
};
const EXPECTED_DELEGATOR = {
  type: {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
        code: 'DELEGATOR',
        display: 'delegator'
      }
    ]
  },
  role: {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
        code: 'DELEGATOR',
        display: 'delegator'
      }
    ]
  },
  who: {
    reference: 'Practitioner/456',
    type: 'Practitioner'
  },
  requestor: true
};

const SINGLE_AGENT_PROVENANCE = {
  resourceType: 'Provenance',
  occurredPeriod: {
    start: '2015-01-01',
    end: '2015-01-02'
  },
  recorded: '2015-02-07T13:28:17.239+02:00',
  policy: 'https://www.policy.com',
  reason: [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActReason',
          code: 'CAREMGT',
          display: 'care management'
        }
      ]
    }
  ],
  activity: {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/v3-DataOperation',
        code: 'CREATE',
        display: 'create'
      }
    ]
  },
  agent: [
    {
      type: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
            code: 'enterer',
            display: 'Enterer'
          }
        ]
      },
      role: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-RoleClass',
            code: 'ASSIGNED',
            display: 'assigned'
          }
        ]
      },
      who: {
        reference: 'Practitioner/123',
        type: 'Practitioner'
      }
    }
  ]
};

const AMENDING_PROVENANCE = {
  target: 'Practitioner/456',
  occurredPeriod: {
    start: '2015-01-01',
    end: '2015-01-02'
  },
  recorded: '2015-02-07T13:28:17.239+02:00',
  policy: 'https://www.policy.com',
  reason: [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActReason',
          code: 'CAREMGT',
          display: 'care management'
        }
      ]
    }
  ],
  activity: {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/v3-DataOperation',
        code: 'UPDATE',
        display: 'revise'
      }
    ]
  },
  agent: [
    {
      type: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
            code: 'enterer',
            display: 'Enterer'
          }
        ]
      },
      role: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-RoleClass',
            code: 'ASSIGNED',
            display: 'assigned'
          }
        ]
      },
      who: {
        reference: 'Practitioner/123',
        type: 'Practitioner'
      }
    },
    {
      type: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
            code: 'enterer',
            display: 'Enterer'
          }
        ]
      },
      role: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-RoleClass',
            code: 'AMENDER',
            display: 'Amender'
          }
        ]
      },
      who: {
        reference: 'Practitioner/456',
        type: 'Practitioner'
      }
    }
  ]
};

const ON_BEHALF_OF_PROVENANCE = {
  target: 'Practitioner/456',
  occurredPeriod: {
    start: '2015-01-01',
    end: '2015-01-02'
  },
  recorded: '2015-02-07T13:28:17.239+02:00',
  policy: 'https://www.policy.com',
  reason: [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActReason',
          code: 'CAREMGT',
          display: 'care management'
        }
      ]
    }
  ],
  activity: {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/v3-DataOperation',
        code: 'CREATE',
        display: 'create'
      }
    ]
  },
  agent: [
    {
      type: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
            code: 'enterer',
            display: 'Enterer'
          }
        ]
      },
      role: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-RoleClass',
            code: 'AGNT',
            display: 'agent'
          }
        ]
      },
      who: {
        reference: 'Practitioner/456',
        type: 'Practitioner'
      },
      onBehalfOf: {
        reference: 'Organization/123',
        type: 'Organization'
      }
    }
  ]
};

const SINGLE_AGENT_AUDIT = {
  resourceType: 'AuditEvent',
  id: 'TEST_ID',
  type: {
    system: 'http://dicom.nema.org/resources/ontology/DCM',
    code: '110100',
    display: 'Application Activity'
  },
  action: 'C',
  period: {
    start: '2015-01-01',
    end: '2015-01-02'
  },
  recorded: '2015-02-07T13:28:17.239+02:00',
  outcome: 0,
  purposeOfEvent: [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActReason',
          code: 'CAREMGT',
          display: 'care management'
        }
      ]
    }
  ],
  agent: [
    {
      type: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
            code: 'enterer',
            display: 'Enterer'
          }
        ]
      },
      role: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-RoleClass',
            code: 'ASSIGNED',
            display: 'assigned'
          }
        ]
      },
      who: {
        reference: 'Practitioner/123',
        type: 'Practitioner'
      },
      requestor: true
    }
  ],
  source: {
    observer: {
      reference: 'Practitioner/123',
      type: 'Practitioner'
    }
  }
};

const AMENDING_AUDIT = {
  resourceType: 'AuditEvent',
  id: 'TEST_ID',
  type: {
    system: 'http://dicom.nema.org/resources/ontology/DCM',
    code: '110100',
    display: 'Application Activity'
  },
  action: 'U',
  period: {
    start: '2015-01-01',
    end: '2015-01-02'
  },
  recorded: '2015-02-07T13:28:17.239+02:00',
  outcome: 0,
  purposeOfEvent: [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActReason',
          code: 'CAREMGT',
          display: 'care management'
        }
      ]
    }
  ],
  agent: [
    {
      type: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
            code: 'enterer',
            display: 'Enterer'
          }
        ]
      },
      role: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-RoleClass',
            code: 'ASSIGNED',
            display: 'assigned'
          }
        ]
      },
      who: {
        reference: 'Practitioner/123',
        type: 'Practitioner'
      },
      requestor: true
    },
    {
      type: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
            code: 'enterer',
            display: 'Enterer'
          }
        ]
      },
      role: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-RoleClass',
            code: 'AMENDER',
            display: 'Amender'
          }
        ]
      },
      who: {
        reference: 'Practitioner/456',
        type: 'Practitioner'
      },
      requestor: true
    }
  ],
  source: {
    observer: {
      reference: 'Practitioner/123',
      type: 'Practitioner'
    }
  }
};

const ON_BEHALF_OF_AUDIT = {
  resourceType: 'AuditEvent',
  id: 'TEST_ID',
  type: {
    system: 'http://dicom.nema.org/resources/ontology/DCM',
    code: '110100',
    display: 'Application Activity'
  },
  action: 'C',
  period: {
    start: '2015-01-01',
    end: '2015-01-02'
  },
  recorded: '2015-02-07T13:28:17.239+02:00',
  outcome: 0,
  purposeOfEvent: [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActReason',
          code: 'CAREMGT',
          display: 'care management'
        }
      ]
    }
  ],
  agent: [
    {
      type: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
            code: 'DELEGATOR',
            display: 'delegator'
          }
        ]
      },
      role: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
            code: 'DELEGATOR',
            display: 'delegator'
          }
        ]
      },
      who: {
        reference: 'Organization/123',
        type: 'Organization'
      },
      requestor: true
    },
    {
      type: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
            code: 'enterer',
            display: 'Enterer'
          }
        ]
      },
      role: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-RoleClass',
            code: 'AGNT',
            display: 'agent'
          }
        ]
      },
      who: {
        reference: 'Practitioner/456',
        type: 'Practitioner'
      },
      requestor: false
    }
  ],
  source: {
    observer: {
      reference: 'Practitioner/456',
      type: 'Practitioner'
    }
  }
};

module.exports = {
  DELEGATOR_WHO,
  EXPECTED_DELEGATOR,
  SINGLE_AGENT_AUDIT,
  SINGLE_AGENT_PROVENANCE,
  ON_BEHALF_OF_AUDIT,
  ON_BEHALF_OF_PROVENANCE,
  AMEDNING_AUDIT,
  AMENDING_PROVENANCE
};
