//@ts-nocheck 
const { ServerError } = require('@projecttacoma/node-fhir-server-core');

/**
 * Child class of ServerError with custom options object
 */
class CustomServerError extends ServerError {
  constructor(message, customStatusCode, customCode) {
    super(message, {
      statusCode: customStatusCode,
      issue: [
        {
          severity: 'error',
          code: customCode,
          details: {
            text: message
          }
        }
      ]
    });
  }
}

/**
 * Error class that throws ServerError with status code 400 and code BadRequest
 */
class BadRequestError extends CustomServerError {
  constructor(message) {
    super(message, 400, 'BadRequest');
  }
}

/**
 * Error class that throws ServerError with status code 501 and code NotImplemented
 */
class NotImplementedError extends CustomServerError {
  constructor(message) {
    super(message, 501, 'NotImplemented');
  }
}

/**
 * Error class that throws ServerError with status code 404 and code ResourceNotFound
 */
class ResourceNotFoundError extends CustomServerError {
  constructor(message) {
    super(message, 404, 'ResourceNotFound');
  }
}

/**
 * Error class that throws ServerError with status code 404 and code NotFound
 */
class NotFoundError extends CustomServerError {
  constructor(message) {
    super(message, 404, 'NotFound');
  }
}

/**
 * Error class that throws ServerError with status code 500 and code Internal
 */
class InternalError extends CustomServerError {
  constructor(message) {
    super(message, 500, 'Internal');
  }
}

/**
 * Error class that throws ServerError with status code 422 and code UnprocessableEntity
 */
class UnprocessableEntityError extends CustomServerError {
  constructor(message) {
    super(message, 422, 'UnprocessableEntity');
  }
}

/**
 * Error class that throws ServerError with status code 500 and custom error code
 */
class BulkStatusError extends CustomServerError {
  constructor(message, errorCode) {
    super(message, 500, errorCode);
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
