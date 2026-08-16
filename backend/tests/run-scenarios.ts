import { runDiscoveryScenarios } from './benefits-discovery/discovery.scenarios';
import { runGeminiModelResolverScenarios } from './benefits-discovery/gemini-model-resolver.scenarios';
import { runEligibilityScenarios } from './eligibility/eligibility.scenarios';
import { runFormPayloadScenario } from './form-payload/form-payload.scenarios';

async function run(): Promise<void> {
  runEligibilityScenarios();
  runFormPayloadScenario();
  runGeminiModelResolverScenarios();
  await runDiscoveryScenarios();
  console.log('Offline backend scenarios: PASS');
}

run().catch((error) => { console.error(error); process.exit(1); });
