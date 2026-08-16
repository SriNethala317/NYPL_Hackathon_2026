import { runDiscoveryScenarios } from './benefits-discovery/discovery.scenarios';
import { runEligibilityScenarios } from './eligibility/eligibility.scenarios';
import { runFormPayloadScenario } from './form-payload/form-payload.scenarios';

async function run(): Promise<void> {
  runEligibilityScenarios();
  runFormPayloadScenario();
  await runDiscoveryScenarios();
  console.log('Offline backend scenarios: PASS');
}

run().catch((error) => { console.error(error); process.exit(1); });
