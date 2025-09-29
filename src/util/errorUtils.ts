const { ServerError } = require('@projecttacoma/node-fhir-server-core');

/**
 * Child class of ServerError with custom options object
 */
class CustomServerError extends ServerError {
  constructor(message: string, customStatusCode: number, customCode: string) {
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
export class BadRequestError extends CustomServerError {
  constructor(message: string) {
    super(message, 400, 'BadRequest');
  }
}

/**
 * Error class that throws ServerError with status code 501 and code NotImplemented
 */
export class NotImplementedError extends CustomServerError {
  constructor(message: string) {
    super(message, 501, 'NotImplemented');
  }
}

/**
 * Error class that throws ServerError with status code 404 and code ResourceNotFound
 */
export class ResourceNotFoundError extends CustomServerError {
  constructor(message: string) {
    super(message, 404, 'ResourceNotFound');
  }
}

/**
 * Error class that throws ServerError with status code 404 and code NotFound
 */
export class NotFoundError extends CustomServerError {
  constructor(message: string) {
    super(message, 404, 'NotFound');
  }
}

/**
 * Error class that throws ServerError with status code 500 and code Internal
 */
export class InternalError extends CustomServerError {
  constructor(message: string) {
    super(message, 500, 'Internal');
  }
}

/**
 * Error class that throws ServerError with status code 422 and code UnprocessableEntity
 */
export class UnprocessableEntityError extends CustomServerError {
  constructor(message: string) {
    super(message, 422, 'UnprocessableEntity');
  }
}

/**
 * Error class that throws ServerError with status code 500 and custom error code
 */
export class BulkStatusError extends CustomServerError {
  constructor(message: string, errorCode: string) {
    super(message, 500, errorCode);
  }
}
