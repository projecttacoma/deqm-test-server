import { getMeasureBundleFromId } from './bundleUtils';
import { Calculator, DRCalculationOutput } from 'fqm-execution';

const PATIENT_ID_CONTEXT_TOKEN = '{{context.patientId}}';

function populatePatientIdContext(dataRequirements: DRCalculationOutput, patientId: string): DRCalculationOutput {
  return {
    ...dataRequirements,
    results: {
      ...dataRequirements.results,
      dataRequirement: dataRequirements.results.dataRequirement?.map(dataRequirement => ({
        ...dataRequirement,
        extension: dataRequirement.extension?.map(extension => ({
          ...extension,
          valueString: extension.valueString?.includes(PATIENT_ID_CONTEXT_TOKEN)
            ? extension.valueString.split(PATIENT_ID_CONTEXT_TOKEN).join(patientId)
            : extension.valueString
        }))
      }))
    }
  };
}

/**
 * To be used in a future $collect-data workflow, this function takes a measure bundle ID
 * and a patient ID and returns the results of calculateDataRequirements with the patient
 * ID injected into the cqfm FHIR queries in the output
 */
export async function patientSpecificDataRequirements(
  measureId: string,
  patientId: string
): Promise<DRCalculationOutput> {
  const measureBundle = await getMeasureBundleFromId(measureId);

  const dataRequirements = await Calculator.calculateDataRequirements(measureBundle);
  return populatePatientIdContext(dataRequirements, patientId);
}
