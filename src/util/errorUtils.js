const { ServerError } = require('@projecttacoma/node-fhir-server-core');

class BadRequestError extends ServerError {
  constructor(message) {
    super(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: message
          }
        }
      ]
    });
  }
}

class NotImplementedError extends ServerError {
  constructor(message) {
    super(null, {
      statusCode: 501,
      issue: [
        {
          severity: 'error',
          code: 'NotImplemented',
          details: {
            text: message
          }
        }
      ]
    });
  }
}

class ResourceNotFoundError extends ServerError {
  constructor(message) {
    super(null, {
      statusCode: 404,
      issue: [
        {
          severity: 'error',
          code: 'ResourceNotFound',
          details: {
            text: message
          }
        }
      ]
    });
  }
}

class NotFoundError extends ServerError {
  constructor(message) {
    super(null, {
      statusCode: 404,
      issue: [
        {
          severity: 'error',
          code: 'NotFound',
          details: {
            text: message
          }
        }
      ]
    });
  }
}

class InternalError extends ServerError {
  constructor(message) {
    super(null, {
      statusCode: 500,
      issue: [
        {
          severity: 'error',
          code: 'internal',
          details: {
            text: message
          }
        }
      ]
    });
  }
}

class UnprocessableEntityError extends ServerError {
  constructor(message) {
    super(null, {
      statusCode: 422,
      issue: [
        {
          severity: 'error',
          code: 'UnprocessableEntity',
          details: {
            text: message
          }
        }
      ]
    });
  }
}

class BulkStatusError extends ServerError {
  constructor(message, errorCode) {
    super(null, {
      statusCode: 500,
      issue: [
        {
          severity: 'error',
          code: errorCode,
          details: {
            text: message
          }
        }
      ]
    });
  }
}

module.exports = {
  BadRequestError,
  NotImplementedError,
  ResourceNotFoundError,
  NotFoundError,
  InternalError,
  UnprocessableEntityError,
  BulkStatusError
};
