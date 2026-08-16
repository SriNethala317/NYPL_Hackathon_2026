import { Router } from 'express';
import { discoverBenefitsController, validateProgramController } from '@/controllers/benefits.controller';

export const benefitsRouter = Router();
benefitsRouter.post('/discover', (request, response, next) => {
  void discoverBenefitsController(request, response).catch(next);
});
benefitsRouter.post('/:programId/validate', validateProgramController);
