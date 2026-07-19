/** report.export worker body — progress → artefact (S3 lands with Phase 18). */
import { Types } from 'mongoose';
import { ReportJob } from '../models/ReportJob';
import { reportService } from '../services/reportService';
import { requestContext } from '../plugins/tenantScope';
import { UnrecoverableError } from '../queues/infra';

export async function processReportExport(data: { reportJobId: string }): Promise<{ done: true }> {
  const job = await ReportJob.findOne({ _id: data.reportJobId }, null, { skipTenantScope: true });
  if (!job) throw new UnrecoverableError('REPORT_JOB_NOT_FOUND');
  if (job.status === 'completed') return { done: true }; // idempotency guard

  job.status = 'running';
  job.progress = 10;
  await job.save();
  try {
    const csv = await requestContext.run(
      { companyId: job.companyId, userId: job.requestedBy },
      () => reportService.exportCsv(job.type, new Date(String(job.params.asOf))),
    );
    job.progress = 90;
    job.artefactCsv = csv;
    job.status = 'completed';
    job.progress = 100;
    await job.save();
    return { done: true };
  } catch (err) {
    job.status = 'failed';
    job.error = String(err);
    await job.save();
    throw new UnrecoverableError(String(err));
  }
}

export function newReportJobId(): Types.ObjectId {
  return new Types.ObjectId();
}
