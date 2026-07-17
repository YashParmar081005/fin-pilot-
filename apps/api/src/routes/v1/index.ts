import { Router } from 'express';
import { accountRoutes } from './account.routes';
import { authRoutes } from './auth.routes';
import { companyRoutes, inviteRoutes } from './company.routes';

export const v1Routes = Router();

v1Routes.use('/auth', authRoutes);
v1Routes.use('/companies', companyRoutes);
v1Routes.use('/invites', inviteRoutes);
v1Routes.use('/accounts', accountRoutes);
