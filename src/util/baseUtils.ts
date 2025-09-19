//@ts-nocheck 
const { BadRequestError } = require('./errorUtils');
const supportedResources = require('../server/supportedResources');
const url = require('url');

/**
 * Determines whether the passed in resourceType is one supported by our server.
 * Throws an error if not.
 * @param {string} resourceType A string representing a FHIR resource type
 */
function checkSupportedResource(resourceType) {
  if (!supportedResources.includes(resourceType)) {
    throw new BadRequestError(`resourceType: ${resourceType} is not a supported resourceType`);
  }
}

/**
 * Determines whether the passed in resourceType is one matches a given type.
 * Throws an error if not.
 * @param {string} resourceType A string representing a FHIR resource type
 * @param {string} expectedResourceType A string representing a FHIR resource type
 */
function checkExpectedResource(resourceType, expectedResourceType) {
  if (resourceType !== expectedResourceType) {
    throw new BadRequestError(`Expected resourceType '${expectedResourceType}' in body. Received '${resourceType}'.`);
  }
}

/**
 * Checks if the content-type header is incorrect and throws an error with guidance if so
 * @param {Object} requestHeaders the headers from the request body
 */
const checkContentTypeHeader = requestHeaders => {
  if (
    requestHeaders['content-type'] !== 'application/json+fhir' &&
    requestHeaders['content-type'] !== 'application/fhir+json'
  ) {
    throw new BadRequestError(
      'Ensure Content-Type is set to application/json+fhir or to application/fhir+json in headers'
    );
  }
};

/**
 * Gets the current time as a FHIR instant to populate meta.lastUpdated for resource creation and updating
 * @returns {string} current time in GMT as a FHIR instant
 */
const getCurrentInstant = () => {
  const event = new Date();
  return event.toISOString();
};

/**
 * Creates pagination links for the search results bundle.
 *
 * @param {string} baseUrl Base URL of the server and FHIR base path. Should be pulled from request.
 * @param {string} resourceType The resource type these results are for.
 * @param {url.URLSearchParams} searchParams The search parameter object used for the initial query pulled from the request.
 * @param {{numberOfPages: number, page: number}} resultsMetadata The results metadata object from the mongo results.
 * @returns {fhir4.BundleLink[]} The links that should be added to the search st results bundle.
 */
function createPaginationLinks(baseUrl, resourceType, searchParams, resultsMetadata) {
  const { numberOfPages, page } = resultsMetadata;
  const links = [];

  // create self link, including query params only if there were any
  if (searchParams.toString() !== '') {
    links.push({
      relation: 'self',
      url: new url.URL(`${resourceType}?${searchParams}`, baseUrl)
    });
  } else {
    links.push({
      relation: 'self',
      url: new url.URL(`${resourceType}`, baseUrl)
    });
  }

  // first page
  searchParams.set('page', 1);
  links.push({
    relation: 'first',
    url: new url.URL(`${resourceType}?${searchParams}`, baseUrl)
  });

  // only add previous and next if appropriate
  if (page > 1) {
    searchParams.set('page', page - 1);
    links.push({
      relation: 'previous',
      url: new url.URL(`${resourceType}?${searchParams}`, baseUrl)
    });
  }
  if (page < numberOfPages) {
    searchParams.set('page', page + 1);
    links.push({
      relation: 'next',
      url: new url.URL(`${resourceType}?${searchParams}`, baseUrl)
    });
  }

  // last page
  searchParams.set('page', numberOfPages);
  links.push({
    relation: 'last',
    url: new url.URL(`${resourceType}?${searchParams}`, baseUrl)
  });

  return links;
}

module.exports = {
  checkSupportedResource,
  checkExpectedResource,
  checkContentTypeHeader,
  getCurrentInstant,
  createPaginationLinks
};
