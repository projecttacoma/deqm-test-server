import { getMeasureBundleFromUrl } from '../../util/bundleUtils';
import { getPatientIds, patientSpecificDataRequirements } from '../../util/measureUtils';
import type { CollectDataInput, CollectionPlan } from './types';

/**
 * Resolve subjects, measure content and requirements without building searches or reports.
 * Extracted from collectData and prepareCollectData in services/measure.service.ts.
 * Target IDs replace the old query-to-MeasureReport object references.
 */
export async function prepareCollectionPlan(input: CollectDataInput): Promise<CollectionPlan> {
  const { subject, subjectGroup, dataEndpoint, measureUrl, periodStart, periodEnd } = input;
  const patientIds = await getPatientIds(subject, subjectGroup, dataEndpoint);
  const measureUrls = Array.isArray(measureUrl) ? measureUrl : [measureUrl];
  const measureBundles = await Promise.all(measureUrls.map(getMeasureBundleFromUrl));
  const options = {
    measurementPeriodStart: periodStart,
    measurementPeriodEnd: periodEnd,
    useExpandedCodeQueries: true
  };
  const subjects = await Promise.all(
    patientIds.map(async (patientId, patientIndex) => ({
      patientId,
      targets: await Promise.all(
        measureBundles.map(async (measureBundle, measureIndex) => ({
          id: `subject-${patientIndex}-measure-${measureIndex}`,
          patientId,
          measureBundle,
          requirements: await patientSpecificDataRequirements(measureBundle, patientId, options)
        }))
      )
    }))
  );
  return { input, subjects };
}
