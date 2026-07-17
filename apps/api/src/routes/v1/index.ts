import { Router } from 'express';
import { authRoutes } from './auth.routes';

export const v1Routes = Router();

v1Routes.use('/auth', authRoutes);
