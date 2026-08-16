import { Router } from 'express';
import { generateFormPayloadController } from '@/controllers/forms.controller';

export const formsRouter = Router();
formsRouter.post('/:programId/payload', generateFormPayloadController);
