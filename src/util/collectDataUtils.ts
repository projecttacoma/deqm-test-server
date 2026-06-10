import { getMeasureBundleFromUrl } from './bundleUtils';
import { CalculationOptions, Calculator, DRCalculationOutput } from 'fqm-execution';

const PATIENT_ID_CONTEXT_TOKEN = '{{context.patientId}}';

function populatePatientIdContext(dataRequirements: DRCalculationOutput, patientId: string): DRCalculationOutput {
  dataRequirements.results.dataRequirement?.forEach(dataRequirement => {
    dataRequirement.extension?.forEach(extension => {
      if (extension.valueString) {
        extension.valueString = extension.valueString.replaceAll(PATIENT_ID_CONTEXT_TOKEN, patientId);
      }
    });
  });
  return dataRequirements;
}

/**
 * To be used in a future $collect-data workflow, this function takes a measure bundle ID
 * and a patient ID and returns the results of calculateDataRequirements with the patient
 * ID injected into the cqfm FHIR queries in the output
 */
export async function patientSpecificDataRequirements(
  measureUrl: string,
  patientId: string,
  options: CalculationOptions = {}
): Promise<DRCalculationOutput> {
  const measureBundle = await getMeasureBundleFromUrl(measureUrl);
  const dataRequirements = await Calculator.calculateDataRequirements(measureBundle, options);
  return populatePatientIdContext(dataRequirements, patientId);
}
